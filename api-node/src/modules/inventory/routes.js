import { Router } from 'express';
import { authenticate, requirePermission, requireStore } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate, requireStore);

router.get('/', requirePermission('inventory.read'), async (req, res) => {
  const { rows } = await req.db.execute(`SELECT b.id, b.medicine_id AS medicineId, m.name AS medicine,
    m.generic_name AS genericName, m.strength, m.dosage_form AS dosageForm, b.number, b.expiry_date AS expiryDate,
    b.cost_price AS costPrice, b.sale_price AS salePrice, b.quantity
    FROM batches b JOIN medicines m ON m.id=b.medicine_id ORDER BY b.expiry_date, m.name COLLATE NOCASE, b.number`);
  res.json(rows);
});

router.get('/expiry', requirePermission('inventory.read'), async (req, res) => {
  const [purchased, opening] = await Promise.all([
    req.db.execute(`SELECT b.id, b.medicine_id AS medicineId, m.name AS medicine,
      b.number AS batch, b.expiry_date AS expiryDate, b.quantity, b.cost_price AS costPrice,
      p.created_at AS purchasedAt, s.name AS supplier, p.supplier_invoice AS supplierInvoice
      FROM batches b JOIN medicines m ON m.id=b.medicine_id JOIN purchase_lines pl ON pl.batch_id=b.id
      JOIN purchases p ON p.id=pl.purchase_id JOIN suppliers s ON s.id=p.supplier_id
      WHERE b.quantity>0 ORDER BY b.expiry_date, m.name COLLATE NOCASE, b.number`),
    req.db.execute(`SELECT b.id, b.medicine_id AS medicineId, m.name AS medicine,
      b.number AS batch, b.expiry_date AS expiryDate, b.quantity, b.cost_price AS costPrice,
      NULL AS purchasedAt, 'Opening stock' AS supplier, 'Opening stock' AS supplierInvoice
      FROM batches b JOIN medicines m ON m.id=b.medicine_id
      WHERE b.quantity>0 AND NOT EXISTS (SELECT 1 FROM purchase_lines pl WHERE pl.batch_id=b.id)
      ORDER BY b.expiry_date, m.name COLLATE NOCASE, b.number`),
  ]);
  res.json([...purchased.rows, ...opening.rows].sort((a, b) => String(a.expiryDate).localeCompare(String(b.expiryDate)) || String(a.medicine).localeCompare(String(b.medicine)) || String(a.batch).localeCompare(String(b.batch))));
});

router.get('/medicines/:medicineId/details', requirePermission('inventory.read'), async (req, res) => {
  const medicineId = Number(req.params.medicineId);
  const { rows: medicineRows } = await req.db.execute({
    sql: `SELECT id, name, generic_name AS genericName, barcode, strength, dosage_form AS dosageForm,
      manufacturer, description, minimum_stock AS minimumStock, is_active AS isActive FROM medicines WHERE id=?`,
    args: [medicineId],
  });
  const medicine = medicineRows[0];
  if (!medicine) return res.status(404).send('Medicine not found.');
  const [batchResult, purchaseResult, paymentResult, returnResult, correctionResult] = await Promise.all([
    req.db.execute({ sql: `SELECT id, number, expiry_date AS expiryDate, cost_price AS costPrice, sale_price AS salePrice, quantity FROM batches WHERE medicine_id=? ORDER BY expiry_date`, args: [medicineId] }),
    req.db.execute({
      sql: `SELECT p.id AS purchaseId, pl.id AS purchaseLineId, b.id AS batchId, b.number AS batch,
        b.expiry_date AS expiryDate, b.quantity AS onHand, b.sale_price AS salePrice, s.name AS supplier,
        p.supplier_invoice AS supplierInvoice, p.created_at AS purchasedAt, pl.quantity, pl.returned_quantity AS returnedQuantity,
        pl.unit_cost AS unitCost, p.total AS invoiceTotal,
        COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.purchase_id=p.id AND sp.method <> 'Supplier Credit'), 0) AS invoicePaid,
        COALESCE((SELECT SUM(pr.total) FROM purchase_returns pr WHERE pr.purchase_id=p.id), 0) AS invoiceReturned
        FROM purchase_lines pl JOIN batches b ON b.id=pl.batch_id JOIN purchases p ON p.id=pl.purchase_id
        JOIN suppliers s ON s.id=p.supplier_id WHERE b.medicine_id=? ORDER BY p.created_at DESC`, args: [medicineId],
    }),
    req.db.execute({
      sql: `SELECT sp.id, p.supplier_invoice AS supplierInvoice, s.name AS supplier, sp.amount,
        sp.method, sp.reference, sp.paid_at AS paidAt FROM supplier_payments sp
        JOIN purchases p ON p.id=sp.purchase_id JOIN suppliers s ON s.id=p.supplier_id
        WHERE EXISTS (SELECT 1 FROM purchase_lines pl JOIN batches b ON b.id=pl.batch_id WHERE pl.purchase_id=p.id AND b.medicine_id=?)
        ORDER BY sp.paid_at DESC`, args: [medicineId],
    }),
    req.db.execute({
      sql: `SELECT prl.id, p.supplier_invoice AS supplierInvoice, s.name AS supplier,
        pr.supplier_reference AS supplierReference, pr.reason, pr.created_at AS createdAt, prl.quantity,
        prl.unit_cost AS unitCost, prl.quantity * prl.unit_cost AS total FROM purchase_return_lines prl
        JOIN purchase_returns pr ON pr.id=prl.purchase_return_id JOIN purchases p ON p.id=pr.purchase_id
        JOIN suppliers s ON s.id=p.supplier_id JOIN batches b ON b.id=prl.batch_id
        WHERE b.medicine_id=? ORDER BY pr.created_at DESC`, args: [medicineId],
    }),
    req.db.execute({
      sql: `SELECT pcl.id, p.supplier_invoice AS supplierInvoice, b.number AS batch, pc.reason,
        pc.created_at AS createdAt, pcl.quantity_before AS previousQuantity,
        pcl.quantity_after AS correctedQuantity, pcl.difference AS quantityChange
        FROM purchase_correction_lines pcl JOIN purchase_corrections pc ON pc.id=pcl.correction_id
        JOIN purchase_lines pl ON pl.id=pcl.purchase_line_id JOIN batches b ON b.id=pl.batch_id
        JOIN purchases p ON p.id=pc.purchase_id WHERE b.medicine_id=? ORDER BY pc.created_at DESC`, args: [medicineId],
    }),
  ]);
  res.json({ medicine, batches: batchResult.rows, purchases: purchaseResult.rows, payments: paymentResult.rows, returns: returnResult.rows, corrections: correctionResult.rows });
});

router.post('/adjustments', requirePermission('inventory.manage'), async (req, res) => {
  const batchId = Number(req.body?.batchId);
  const change = Number(req.body?.quantityChange);
  const reason = String(req.body?.reason ?? '').trim();
  const type = String(req.body?.type ?? 'Adjustment').trim();
  if (!Number.isSafeInteger(batchId) || !Number.isInteger(change) || change === 0 || !reason || !['Adjustment', 'Damage'].includes(type) || (type === 'Damage' && change > 0)) {
    return res.status(400).json({ message: 'A nonzero quantity change and reason are required.' });
  }
  const tx = await req.db.transaction('write');
  try {
    const update = await tx.execute({
      sql: `UPDATE batches SET quantity=quantity+?, version=version+1 WHERE id=? AND quantity+?>=0 RETURNING id, quantity`,
      args: [change, batchId, change],
    });
    if (!update.rows.length) {
      const exists = await tx.execute({ sql: 'SELECT id FROM batches WHERE id=?', args: [batchId] });
      await tx.rollback();
      return exists.rows.length ? res.status(409).json({ message: 'Adjustment cannot reduce saleable stock below zero.' }) : res.status(404).json({ message: 'Batch not found.' });
    }
    const quantity = Number(update.rows[0].quantity);
    const movement = await tx.execute({
      sql: `INSERT INTO stock_movements(batch_id, type, quantity_change, balance_after, reason, actor_id)
        VALUES(?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [batchId, type, change, quantity, reason, req.auth.userId],
    });
    await tx.commit();
    res.json({ id: batchId, quantity, movementId: Number(movement.rows[0].id) });
  } catch (error) { await tx.rollback(); throw error; }
});

router.get('/movements', requirePermission('inventory.read'), async (req, res) => {
  const batchId = req.query.batchId ? Number(req.query.batchId) : null;
  const take = Math.max(1, Math.min(500, Number(req.query.take ?? 100)));
  const { rows } = await req.db.execute({
    sql: `SELECT sm.id, sm.batch_id AS batchId, m.name AS medicine, b.number AS batch,
      sm.type, sm.quantity_change AS quantityChange, sm.balance_after AS balanceAfter,
      sm.reason, sm.created_at AS createdAt FROM stock_movements sm
      JOIN batches b ON b.id=sm.batch_id JOIN medicines m ON m.id=b.medicine_id
      WHERE (? IS NULL OR sm.batch_id=?) ORDER BY sm.created_at DESC LIMIT ?`,
    args: [batchId, batchId, take],
  });
  res.json(rows);
});

export default router;
