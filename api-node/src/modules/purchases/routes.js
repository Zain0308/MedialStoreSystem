import { Router } from 'express';
import { authenticate, requirePermission, requireStore } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate, requireStore);
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

async function supplierCredit(db, supplierId) {
  const { rows } = await db.execute({
    sql: `SELECT
      COALESCE((SELECT SUM(total) FROM purchases WHERE supplier_id=?), 0) AS purchases,
      COALESCE((SELECT SUM(pr.total) FROM purchase_returns pr JOIN purchases p ON p.id=pr.purchase_id WHERE p.supplier_id=?), 0) AS returns,
      COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp JOIN purchases p ON p.id=sp.purchase_id WHERE p.supplier_id=? AND sp.method <> 'Supplier Credit'), 0) AS cashPaid`,
    args: [supplierId, supplierId, supplierId],
  });
  return Math.max(0, roundMoney(Number(rows[0].cashPaid) - Number(rows[0].purchases) + Number(rows[0].returns)));
}

router.post('/', requirePermission('purchases.create'), async (req, res) => {
  const supplierId = Number(req.body?.supplierId);
  const supplierInvoice = String(req.body?.supplierInvoice ?? '').trim();
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const paymentAmount = roundMoney(Number(req.body?.paymentAmount ?? 0));
  const requestedMethod = String(req.body?.paymentMethod ?? '').trim();
  const method = ['Cash', 'Bank Transfer', 'Credit'].find((value) => value.toLowerCase() === requestedMethod.toLowerCase()) ?? null;
  if (!Number.isSafeInteger(supplierId) || !supplierInvoice || lines.length === 0 || lines.some((line) =>
    !Number.isSafeInteger(Number(line.medicineId)) || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0 ||
    Number(line.costPrice) < 0 || Number(line.salePrice) < 0 || !String(line.batchNumber ?? '').trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(line.expiryDate ?? '')) || Date.parse(`${line.expiryDate}T00:00:00Z`) <= Date.now())) {
    return res.status(400).json({ message: 'Invoice, lines, positive quantities, valid prices and future expiry are required.' });
  }
  if (paymentAmount < 0 || (paymentAmount > 0 && !method)) return res.status(400).json({ message: 'Payment amount cannot be negative. Select a payment method when recording a payment.' });
  if (paymentAmount > 0 && method === 'Credit') return res.status(400).json({ message: 'Credit means no payment is being made now; enter an amount only for Cash or Bank Transfer.' });
  const supplier = await req.db.execute({ sql: 'SELECT id FROM suppliers WHERE id=? AND is_active=1', args: [supplierId] });
  if (!supplier.rows.length) return res.status(400).json({ message: 'Supplier not found or inactive.' });
  const medicineIds = [...new Set(lines.map((line) => Number(line.medicineId)))];
  const activeMedicines = await req.db.execute({ sql: `SELECT id FROM medicines WHERE is_active=1 AND id IN (${medicineIds.map(() => '?').join(',')})`, args: medicineIds });
  if (activeMedicines.rows.length !== medicineIds.length) return res.status(400).json({ message: 'Medicine not found or inactive.' });
  const duplicate = await req.db.execute({ sql: 'SELECT id FROM purchases WHERE supplier_id=? AND supplier_invoice=?', args: [supplierId, supplierInvoice] });
  if (duplicate.rows.length) return res.status(409).json({ message: 'Supplier invoice already received.' });

  const total = roundMoney(lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.costPrice), 0));
  const tx = await req.db.transaction('write');
  try {
    const available = await supplierCredit(tx, supplierId);
    const purchaseResult = await tx.execute({ sql: 'INSERT INTO purchases(supplier_id, supplier_invoice, total) VALUES(?, ?, ?) RETURNING id', args: [supplierId, supplierInvoice, total] });
    const purchaseId = Number(purchaseResult.rows[0].id);
    for (const line of lines) {
      const batchResult = await tx.execute({
        sql: `INSERT INTO batches(medicine_id, number, expiry_date, cost_price, sale_price, quantity)
          VALUES(?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [Number(line.medicineId), String(line.batchNumber).trim(), line.expiryDate, Number(line.costPrice), Number(line.salePrice), Number(line.quantity)],
      });
      const batchId = Number(batchResult.rows[0].id);
      await tx.execute({
        sql: 'INSERT INTO purchase_lines(purchase_id, batch_id, quantity, unit_cost) VALUES(?, ?, ?, ?)',
        args: [purchaseId, batchId, Number(line.quantity), Number(line.costPrice)],
      });
      await tx.execute({
        sql: `INSERT INTO stock_movements(batch_id, type, reference_id, quantity_change, balance_after, reason, actor_id)
          VALUES(?, 'Purchase', ?, ?, ?, ?, ?)`,
        args: [batchId, purchaseId, Number(line.quantity), Number(line.quantity), `Supplier invoice ${supplierInvoice}`, req.auth.userId],
      });
    }
    const creditApplied = req.body?.applySupplierCredit ? Math.min(total, available) : 0;
    if (paymentAmount > 0) await tx.execute({
      sql: 'INSERT INTO supplier_payments(purchase_id, amount, method, reference) VALUES(?, ?, ?, ?)',
      args: [purchaseId, paymentAmount, method, String(req.body?.paymentReference ?? '').trim() || null],
    });
    if (creditApplied > 0) await tx.execute({
      sql: 'INSERT INTO supplier_payments(purchase_id, amount, method, reference) VALUES(?, ?, ?, ?)',
      args: [purchaseId, creditApplied, 'Supplier Credit', 'Applied from supplier credit'],
    });
    await tx.commit();
    res.status(201).location(`/api/purchases/${purchaseId}`).json({ id: purchaseId, total, paymentAmount, paymentMethod: paymentAmount > 0 ? method : null, supplierCreditApplied: creditApplied });
  } catch (error) { await tx.rollback(); throw error; }
});

router.get('/suppliers/:supplierId/available-credit', requirePermission('purchases.create'), async (req, res) => {
  const supplierId = Number(req.params.supplierId);
  const supplier = await req.db.execute({ sql: 'SELECT id FROM suppliers WHERE id=? AND is_active=1', args: [supplierId] });
  if (!supplier.rows.length) return res.status(404).send('Active supplier not found.');
  res.json({ supplierId, availableCredit: await supplierCredit(req.db, supplierId) });
});

async function getInvoices(db, where = '', args = []) {
  const { rows: invoices } = await db.execute({
    sql: `SELECT p.id, s.name AS supplier, p.supplier_invoice AS supplierInvoice, p.created_at AS createdAt,
      p.total AS total, COALESCE((SELECT SUM(r.total) FROM purchase_returns r WHERE r.purchase_id=p.id),0) AS returnedTotal,
      COALESCE((SELECT SUM(pay.amount) FROM supplier_payments pay WHERE pay.purchase_id=p.id),0) AS paidTotal
      FROM purchases p JOIN suppliers s ON s.id=p.supplier_id ${where} ORDER BY p.id DESC LIMIT 500`, args,
  });
  const result = [];
  for (const invoice of invoices) {
    const [lines, returns, payments, corrections] = await Promise.all([
      db.execute({ sql: `SELECT pl.id, m.name AS medicine, b.number AS batch, pl.quantity,
        pl.returned_quantity AS returnedQuantity, pl.unit_cost AS unitCost, b.quantity AS onHand
        FROM purchase_lines pl JOIN batches b ON b.id=pl.batch_id JOIN medicines m ON m.id=b.medicine_id WHERE pl.purchase_id=? ORDER BY pl.id`, args: [invoice.id] }),
      db.execute({ sql: `SELECT id, supplier_reference AS supplierReference, reason, created_at AS createdAt, total
        FROM purchase_returns WHERE purchase_id=? ORDER BY id DESC`, args: [invoice.id] }),
      db.execute({ sql: `SELECT id, amount, method, reference, paid_at AS paidAt FROM supplier_payments WHERE purchase_id=? ORDER BY id DESC`, args: [invoice.id] }),
      db.execute({
        sql: `SELECT pc.id, pc.reason, pc.actor_id AS actorId, pc.created_at AS createdAt, pc.previous_total AS previousTotal,
          pc.corrected_total AS correctedTotal, pcl.purchase_line_id AS purchaseLineId, m.name AS medicine,
          b.number AS batch, pcl.quantity_before AS previousQuantity, pcl.quantity_after AS correctedQuantity,
          pcl.difference AS quantityChange FROM purchase_corrections pc
          LEFT JOIN purchase_correction_lines pcl ON pcl.correction_id=pc.id
          LEFT JOIN purchase_lines pl ON pl.id=pcl.purchase_line_id LEFT JOIN batches b ON b.id=pl.batch_id
          LEFT JOIN medicines m ON m.id=b.medicine_id WHERE pc.purchase_id=? ORDER BY pc.created_at DESC`, args: [invoice.id],
      }),
    ]);
    const correctionMap = new Map();
    for (const correction of corrections.rows) {
      const item = correctionMap.get(Number(correction.id)) ?? {
        id: Number(correction.id), reason: correction.reason, actorId: correction.actorId, createdAt: correction.createdAt,
        previousTotal: Number(correction.previousTotal), correctedTotal: Number(correction.correctedTotal), lines: [],
      };
      if (correction.purchaseLineId != null) item.lines.push({
        purchaseLineId: Number(correction.purchaseLineId), medicine: correction.medicine, batch: correction.batch,
        previousQuantity: Number(correction.previousQuantity), correctedQuantity: Number(correction.correctedQuantity), quantityChange: Number(correction.quantityChange),
      });
      correctionMap.set(item.id, item);
    }
    result.push({ ...invoice, id: Number(invoice.id), total: Number(invoice.total), returnedTotal: Number(invoice.returnedTotal), paidTotal: Number(invoice.paidTotal),
      lines: lines.rows, returns: returns.rows, payments: payments.rows, corrections: [...correctionMap.values()] });
  }
  return result;
}

router.get('/', requirePermission('purchases.read'), async (req, res) => res.json(await getInvoices(req.db)));

router.get('/supplier-accounts', requirePermission('purchases.read'), async (req, res) => {
  const { rows } = await req.db.execute(`SELECT s.id AS supplierId, s.name AS supplier,
    COUNT(DISTINCT p.id) AS invoiceCount, COALESCE(SUM(DISTINCT p.total),0) AS purchaseTotal
    FROM suppliers s LEFT JOIN purchases p ON p.supplier_id=s.id GROUP BY s.id ORDER BY s.name COLLATE NOCASE`);
  const result = [];
  for (const item of rows) {
    const account = await req.db.execute({
      sql: `SELECT COALESCE((SELECT SUM(total) FROM purchases WHERE supplier_id=?),0) AS purchases,
        COALESCE((SELECT SUM(pr.total) FROM purchase_returns pr JOIN purchases p ON p.id=pr.purchase_id WHERE p.supplier_id=?),0) AS returns,
        COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp JOIN purchases p ON p.id=sp.purchase_id WHERE p.supplier_id=? AND sp.method <> 'Supplier Credit'),0) AS paid`,
      args: [item.supplierId, item.supplierId, item.supplierId],
    });
    const row = account.rows[0];
    result.push({ supplierId: Number(item.supplierId), supplier: item.supplier, invoiceCount: Number(item.invoiceCount),
      purchaseTotal: Number(row.purchases), returnedTotal: Number(row.returns), paidTotal: Number(row.paid),
      balance: roundMoney(Number(row.purchases) - Number(row.returns) - Number(row.paid)) });
  }
  res.json(result);
});

router.get('/suppliers/:supplierId/statement', requirePermission('purchases.read'), async (req, res) => {
  const supplierId = Number(req.params.supplierId);
  const supplier = await req.db.execute({ sql: 'SELECT id, name FROM suppliers WHERE id=?', args: [supplierId] });
  if (!supplier.rows.length) return res.status(404).send('Supplier not found in this store.');
  const invoices = await getInvoices(req.db, 'WHERE p.supplier_id=?', [supplierId]);
  const purchaseTotal = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const returnedTotal = invoices.reduce((sum, invoice) => sum + invoice.returnedTotal, 0);
  const cashPaidTotal = invoices.flatMap((invoice) => invoice.payments).filter((payment) => payment.method !== 'Supplier Credit').reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balance = roundMoney(purchaseTotal - returnedTotal - cashPaidTotal);
  res.json({ supplierId, supplier: supplier.rows[0].name, purchaseTotal, returnedTotal, cashPaidTotal,
    payableAmount: Math.max(0, balance), supplierCredit: Math.max(0, -balance), invoices });
});

router.post('/:id/corrections', requirePermission('purchases.manage'), async (req, res) => {
  const purchaseId = Number(req.params.id);
  const reason = String(req.body?.reason ?? '').trim();
  const requested = Array.isArray(req.body?.lines) ? req.body.lines : [];
  if (!reason || reason.length > 300 || !requested.length || requested.some((line) => !Number.isInteger(Number(line.correctedQuantity)) || Number(line.correctedQuantity) <= 0) || new Set(requested.map((line) => Number(line.purchaseLineId))).size !== requested.length) {
    return res.status(400).json({ message: 'Enter a reason and positive corrected quantity for each selected purchase line.' });
  }
  const tx = await req.db.transaction('write');
  try {
    const purchaseResult = await tx.execute({ sql: 'SELECT id, total FROM purchases WHERE id=?', args: [purchaseId] });
    if (!purchaseResult.rows.length) { await tx.rollback(); return res.sendStatus(404); }
    const { rows: lines } = await tx.execute({
      sql: `SELECT pl.id, pl.quantity, pl.returned_quantity AS returnedQuantity, pl.unit_cost AS unitCost,
        b.id AS batchId, b.quantity AS stock, b.number AS batchNumber, m.name AS medicine
        FROM purchase_lines pl JOIN batches b ON b.id=pl.batch_id JOIN medicines m ON m.id=b.medicine_id WHERE pl.purchase_id=?`, args: [purchaseId],
    });
    const byId = new Map(lines.map((line) => [Number(line.id), line]));
    const edits = [];
    for (const input of requested) {
      const line = byId.get(Number(input.purchaseLineId));
      if (!line) { await tx.rollback(); return res.status(400).json({ message: 'A purchase line does not belong to this invoice.' }); }
      const corrected = Number(input.correctedQuantity), delta = corrected - Number(line.quantity);
      if (corrected < Number(line.returnedQuantity)) { await tx.rollback(); return res.status(409).json({ message: 'Corrected quantity cannot be less than the quantity already returned to the supplier.' }); }
      if (delta < 0 && Number(line.stock) < -delta) { await tx.rollback(); return res.status(409).json({ message: `Cannot reduce ${line.medicine} by ${-delta}; only ${line.stock} units remain in this batch.` }); }
      if (delta) edits.push({ line, corrected, delta });
    }
    if (!edits.length) { await tx.rollback(); return res.status(400).json({ message: 'No purchase quantities have changed.' }); }
    const previousTotal = Number(purchaseResult.rows[0].total);
    const correctedTotal = roundMoney(lines.reduce((sum, line) => {
      const edit = edits.find((item) => Number(item.line.id) === Number(line.id));
      return sum + Number(edit?.corrected ?? line.quantity) * Number(line.unitCost);
    }, 0));
    const correction = await tx.execute({
      sql: 'INSERT INTO purchase_corrections(purchase_id, reason, actor_id, previous_total, corrected_total) VALUES(?, ?, ?, ?, ?) RETURNING id',
      args: [purchaseId, reason, req.auth.userId, previousTotal, correctedTotal],
    });
    const correctionId = Number(correction.rows[0].id);
    for (const { line, corrected, delta } of edits) {
      const update = await tx.execute({
        sql: `UPDATE batches SET quantity=quantity+?, version=version+1 WHERE id=? AND quantity+?>=0 RETURNING quantity`,
        args: [delta, line.batchId, delta],
      });
      if (!update.rows.length) throw Object.assign(new Error('Batch stock changed; refresh and try again.'), { status: 409 });
      const quantity = Number(update.rows[0].quantity);
      await tx.execute({ sql: 'UPDATE purchase_lines SET quantity=? WHERE id=?', args: [corrected, line.id] });
      await tx.execute({ sql: 'INSERT INTO purchase_correction_lines(correction_id, purchase_line_id, quantity_before, quantity_after, difference) VALUES(?, ?, ?, ?, ?)', args: [correctionId, line.id, line.quantity, corrected, delta] });
      await tx.execute({ sql: `INSERT INTO stock_movements(batch_id, type, reference_id, quantity_change, balance_after, reason, actor_id) VALUES(?, 'PurchaseCorrection', ?, ?, ?, ?, ?)`, args: [line.batchId, purchaseId, delta, quantity, reason, req.auth.userId] });
    }
    await tx.execute({ sql: 'UPDATE purchases SET total=? WHERE id=?', args: [correctedTotal, purchaseId] });
    await tx.commit();
    res.json({ id: correctionId, previousTotal, correctedTotal, quantityChanges: edits.length });
  } catch (error) { await tx.rollback(); throw error; }
});

router.get('/:id/corrections', requirePermission('purchases.read'), async (req, res) => {
  const purchaseId = Number(req.params.id);
  const exists = await req.db.execute({ sql: 'SELECT id FROM purchases WHERE id=?', args: [purchaseId] });
  if (!exists.rows.length) return res.sendStatus(404);
  const { rows } = await req.db.execute({
    sql: `SELECT pc.id, pc.reason, pc.actor_id AS actorId, pc.created_at AS createdAt,
      pc.previous_total AS previousTotal, pc.corrected_total AS correctedTotal,
      pcl.purchase_line_id AS purchaseLineId, m.name AS medicine, b.number AS batch,
      pcl.quantity_before AS previousQuantity, pcl.quantity_after AS correctedQuantity, pcl.difference AS quantityChange
      FROM purchase_corrections pc LEFT JOIN purchase_correction_lines pcl ON pcl.correction_id=pc.id
      LEFT JOIN purchase_lines pl ON pl.id=pcl.purchase_line_id LEFT JOIN batches b ON b.id=pl.batch_id
      LEFT JOIN medicines m ON m.id=b.medicine_id WHERE pc.purchase_id=? ORDER BY pc.created_at DESC`, args: [purchaseId],
  });
  const grouped = new Map();
  for (const row of rows) {
    const item = grouped.get(Number(row.id)) ?? { id: Number(row.id), reason: row.reason, actorId: row.actorId, createdAt: row.createdAt, previousTotal: Number(row.previousTotal), correctedTotal: Number(row.correctedTotal), lines: [] };
    if (row.purchaseLineId != null) item.lines.push({ purchaseLineId: Number(row.purchaseLineId), medicine: row.medicine, batch: row.batch, previousQuantity: Number(row.previousQuantity), correctedQuantity: Number(row.correctedQuantity), quantityChange: Number(row.quantityChange) });
    grouped.set(item.id, item);
  }
  res.json([...grouped.values()]);
});

router.post('/:id/returns', requirePermission('purchases.manage'), async (req, res) => {
  const purchaseId = Number(req.params.id);
  const supplierReference = String(req.body?.supplierReference ?? '').trim();
  const reason = String(req.body?.reason ?? '').trim();
  const inputs = Array.isArray(req.body?.lines) ? req.body.lines : [];
  if (!supplierReference || !reason || !inputs.length || inputs.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0)) return res.status(400).json({ message: 'Supplier reference, return reason and positive line quantities are required.' });
  const grouped = new Map();
  for (const line of inputs) grouped.set(Number(line.purchaseLineId), (grouped.get(Number(line.purchaseLineId)) ?? 0) + Number(line.quantity));
  const tx = await req.db.transaction('write');
  try {
    const { rows: purchases } = await tx.execute({ sql: 'SELECT id FROM purchases WHERE id=?', args: [purchaseId] });
    if (!purchases.length) { await tx.rollback(); return res.sendStatus(404); }
    const { rows } = await tx.execute({ sql: `SELECT pl.id, pl.quantity, pl.returned_quantity AS returnedQuantity, pl.unit_cost AS unitCost, b.id AS batchId, b.quantity AS stock FROM purchase_lines pl JOIN batches b ON b.id=pl.batch_id WHERE pl.purchase_id=?`, args: [purchaseId] });
    const byId = new Map(rows.map((line) => [Number(line.id), line]));
    for (const [lineId, quantity] of grouped) {
      const line = byId.get(lineId);
      if (!line) { await tx.rollback(); return res.status(400).json({ message: 'Purchase line does not belong to this invoice.' }); }
      if (quantity > Number(line.quantity) - Number(line.returnedQuantity) || quantity > Number(line.stock)) { await tx.rollback(); return res.status(409).json({ message: 'Return quantity exceeds unreturned purchase quantity or current stock on hand.' }); }
    }
    const returnResult = await tx.execute({ sql: 'INSERT INTO purchase_returns(purchase_id, supplier_reference, reason, total) VALUES(?, ?, ?, 0) RETURNING id', args: [purchaseId, supplierReference, reason] });
    const returnId = Number(returnResult.rows[0].id);
    let total = 0;
    for (const [lineId, quantity] of grouped) {
      const line = byId.get(lineId);
      const update = await tx.execute({ sql: 'UPDATE batches SET quantity=quantity-?, version=version+1 WHERE id=? AND quantity>=? RETURNING quantity', args: [quantity, line.batchId, quantity] });
      if (!update.rows.length) throw Object.assign(new Error('Batch stock changed; refresh and try again.'), { status: 409 });
      const balance = Number(update.rows[0].quantity);
      await tx.execute({ sql: 'UPDATE purchase_lines SET returned_quantity=returned_quantity+? WHERE id=?', args: [quantity, lineId] });
      await tx.execute({ sql: 'INSERT INTO purchase_return_lines(purchase_return_id, purchase_line_id, batch_id, quantity, unit_cost) VALUES(?, ?, ?, ?, ?)', args: [returnId, lineId, line.batchId, quantity, line.unitCost] });
      await tx.execute({ sql: `INSERT INTO stock_movements(batch_id, type, reference_id, quantity_change, balance_after, reason, actor_id) VALUES(?, 'PurchaseReturn', ?, ?, ?, ?, ?)`, args: [line.batchId, purchaseId, -quantity, balance, reason, req.auth.userId] });
      total += quantity * Number(line.unitCost);
    }
    total = roundMoney(total);
    await tx.execute({ sql: 'UPDATE purchase_returns SET total=? WHERE id=?', args: [total, returnId] });
    await tx.commit();
    res.status(201).location(`/api/purchases/${purchaseId}/returns/${returnId}`).json({ id: returnId, total });
  } catch (error) { await tx.rollback(); throw error; }
});

router.post('/:id/payments', requirePermission('purchases.manage'), async (req, res) => {
  const purchaseId = Number(req.params.id);
  const amount = roundMoney(Number(req.body?.amount));
  const requested = String(req.body?.method ?? '').trim();
  const method = ['Cash', 'Bank Transfer'].find((value) => value.toLowerCase() === requested.toLowerCase());
  if (amount <= 0 || !method) return res.status(400).json({ message: 'Enter a positive payment using Cash or Bank Transfer.' });
  const tx = await req.db.transaction('write');
  try {
    const { rows } = await tx.execute({
      sql: `SELECT p.id, p.total, COALESCE((SELECT SUM(r.total) FROM purchase_returns r WHERE r.purchase_id=p.id),0) AS returns,
        COALESCE((SELECT SUM(pay.amount) FROM supplier_payments pay WHERE pay.purchase_id=p.id),0) AS paid
        FROM purchases p WHERE p.id=?`, args: [purchaseId],
    });
    if (!rows.length) { await tx.rollback(); return res.sendStatus(404); }
    const outstanding = Math.max(0, Number(rows[0].total) - Number(rows[0].returns) - Number(rows[0].paid));
    const { rows: paymentRows } = await tx.execute({
      sql: 'INSERT INTO supplier_payments(purchase_id, amount, method, reference) VALUES(?, ?, ?, ?) RETURNING id',
      args: [purchaseId, amount, method, String(req.body?.reference ?? '').trim() || null],
    });
    await tx.commit();
    res.status(201).location(`/api/purchases/${purchaseId}/payments/${paymentRows[0].id}`).json({ id: Number(paymentRows[0].id), amount, method, supplierCreditAdded: Math.max(0, roundMoney(amount - outstanding)) });
  } catch (error) { await tx.rollback(); throw error; }
});

export default router;
