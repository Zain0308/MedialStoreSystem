import { Router } from 'express';
import { authenticate, requirePermission, requireStore } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate, requireStore);
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const returnMethods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet'];

router.get('/customers', requirePermission('sales.create'), async (req, res) => {
  const { rows } = await req.db.execute('SELECT id, name FROM customers WHERE is_active=1 ORDER BY name COLLATE NOCASE');
  res.json(rows);
});

router.post('/', requirePermission('sales.create'), async (req, res) => {
  const inputs = Array.isArray(req.body?.lines) ? req.body.lines : [];
  const methodInput = String(req.body?.paymentMethod ?? '').trim();
  const methods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet', 'Not Received'];
  const method = methods.find((value) => value.toLowerCase() === methodInput.toLowerCase());
  const cashReceived = Number(req.body?.cashReceived ?? 0);
  const discountAmount = roundMoney(Number(req.body?.discountAmount ?? 0));
  const amountPaidInput = req.body?.amountPaid == null ? null : roundMoney(Number(req.body.amountPaid));
  const customerId = req.body?.customerId == null ? null : Number(req.body.customerId);
  if (!inputs.length || inputs.some((line) => !Number.isSafeInteger(Number(line.medicineId)) || !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0) ||
      !method || cashReceived < 0 || discountAmount < 0 || (amountPaidInput != null && amountPaidInput < 0)) {
    return res.status(400).json({ message: 'Select items, enter positive quantities and valid discount, tender and payment method.' });
  }
  const grouped = new Map();
  for (const line of inputs) grouped.set(Number(line.medicineId), (grouped.get(Number(line.medicineId)) ?? 0) + Number(line.quantity));
  const isCash = method === 'Cash';
  const isNotReceived = method === 'Not Received';
  if (isNotReceived && !customerId) return res.status(400).json({ message: 'Choose a customer when payment has not been received.' });
  const tx = await req.db.transaction('write');
  try {
    let customer = null;
    if (customerId) {
      const customerResult = await tx.execute({ sql: 'SELECT id FROM customers WHERE id=? AND is_active=1', args: [customerId] });
      if (!customerResult.rows.length) { await tx.rollback(); return res.status(400).json({ message: 'Customer is unavailable in this store.' }); }
      customer = customerResult.rows[0];
    }
    const ids = [...grouped.keys()];
    const { rows: medicines } = await tx.execute({ sql: `SELECT id, is_active AS isActive, requires_prescription AS requiresPrescription FROM medicines WHERE id IN (${ids.map(() => '?').join(',')})`, args: ids });
    if (medicines.length !== ids.length || medicines.some((item) => !item.isActive || item.requiresPrescription)) {
      await tx.rollback(); return res.status(400).json({ message: 'Medicine is unavailable or requires a prescription workflow.' });
    }
    const saleLines = [];
    for (const [medicineId, wanted] of grouped) {
      const { rows: batches } = await tx.execute({
        sql: `SELECT id, number, expiry_date AS expiryDate, quantity, sale_price AS salePrice, cost_price AS costPrice
          FROM batches WHERE medicine_id=? AND expiry_date > date('now') AND quantity > 0 ORDER BY expiry_date, id`, args: [medicineId],
      });
      let remaining = wanted;
      for (const batch of batches) {
        if (!remaining) break;
        const taken = Math.min(Number(batch.quantity), remaining);
        const update = await tx.execute({ sql: 'UPDATE batches SET quantity=quantity-?, version=version+1 WHERE id=? AND quantity>=? RETURNING quantity', args: [taken, batch.id, taken] });
        if (!update.rows.length) throw Object.assign(new Error('Stock changed while this sale was being completed. Please retry.'), { status: 409 });
        const balance = Number(update.rows[0].quantity);
        saleLines.push({ batchId: Number(batch.id), number: batch.number, quantity: taken, unitPrice: Number(batch.salePrice), unitCost: Number(batch.costPrice), balance });
        remaining -= taken;
      }
      if (remaining > 0) { await tx.rollback(); return res.status(409).json({ message: `Insufficient available stock for medicine ${medicineId}.` }); }
    }
    const subtotal = roundMoney(saleLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
    if (discountAmount > subtotal) { await tx.rollback(); return res.status(400).json({ message: 'Discount cannot exceed the sale subtotal.' }); }
    const total = roundMoney(subtotal - discountAmount);
    const amountPaid = isNotReceived ? 0 : isCash ? Math.min(cashReceived, total) : amountPaidInput ?? total;
    if (amountPaid < 0 || amountPaid > total) { await tx.rollback(); return res.status(400).json({ message: `Amount paid must be between 0 and ${total.toFixed(2)}.` }); }
    if (amountPaid < total && !customer) { await tx.rollback(); return res.status(400).json({ message: 'Choose a customer to keep the unpaid balance on their account.' }); }
    if (isCash && cashReceived < total && !customer) { await tx.rollback(); return res.status(400).json({ message: `Cash received must be at least ${total.toFixed(2)} unless the customer has an account.` }); }
    const finalMethod = amountPaid === 0 && isNotReceived ? 'Not Received' : amountPaid < total ? 'Credit' : method;
    const sale = await tx.execute({
      sql: `INSERT INTO sales(invoice_number, total, subtotal, discount_amount, payment_method, customer_id, cash_received, cashier_id)
        VALUES('PENDING', ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [total, subtotal, discountAmount, finalMethod, customer?.id ?? null, isCash ? cashReceived : 0, req.auth.userId],
    });
    const saleId = Number(sale.rows[0].id);
    const invoiceNumber = `INV-${String(saleId).padStart(8, '0')}`;
    await tx.execute({ sql: 'UPDATE sales SET invoice_number=? WHERE id=?', args: [invoiceNumber, saleId] });
    let distributedDiscount = 0;
    for (let i = 0; i < saleLines.length; i++) {
      const line = saleLines[i];
      const gross = line.unitPrice * line.quantity;
      const lineDiscount = i === saleLines.length - 1 ? roundMoney(discountAmount - distributedDiscount) : (subtotal === 0 ? 0 : roundMoney(discountAmount * gross / subtotal));
      distributedDiscount = roundMoney(distributedDiscount + lineDiscount);
      await tx.execute({
        sql: 'INSERT INTO sale_lines(sale_id, batch_id, quantity, unit_price, unit_cost, discount_amount) VALUES(?, ?, ?, ?, ?, ?)',
        args: [saleId, line.batchId, line.quantity, line.unitPrice, line.unitCost, lineDiscount],
      });
      await tx.execute({
        sql: `INSERT INTO stock_movements(batch_id, type, reference_id, quantity_change, balance_after, reason, actor_id)
          VALUES(?, 'Sale', ?, ?, ?, ?, ?)`, args: [line.batchId, saleId, -line.quantity, line.balance, invoiceNumber, req.auth.userId],
      });
    }
    if (amountPaid > 0 && amountPaid < total && customer) await tx.execute({
      sql: 'INSERT INTO customer_payments(customer_id, sale_id, amount, method) VALUES(?, ?, ?, ?)', args: [customer.id, saleId, amountPaid, method],
    });
    await tx.commit();
    res.status(201).location(`/api/sales/${saleId}`).json({ id: saleId, invoiceNumber, subtotal, discountAmount, total, paymentMethod: finalMethod, customerId: customer?.id ?? null, paidNow: amountPaid, balance: roundMoney(total - amountPaid), change: isCash ? Math.max(0, roundMoney(cashReceived - amountPaid)) : 0 });
  } catch (error) { await tx.rollback(); throw error; }
});

router.get('/', requirePermission('sales.read'), async (req, res) => {
  const take = Math.max(1, Math.min(500, Number(req.query.take ?? 100)));
  const { rows } = await req.db.execute({
    sql: `SELECT s.id, s.invoice_number AS invoiceNumber, s.created_at AS createdAt, s.subtotal,
      s.discount_amount AS discountAmount, s.total, s.payment_method AS paymentMethod,
      COALESCE((SELECT SUM(r.total_refund) FROM sale_returns r WHERE r.sale_id=s.id),0) AS returnedTotal
      FROM sales s ORDER BY s.id DESC LIMIT ?`, args: [take],
  });
  res.json(rows);
});

router.get('/:id', requirePermission('sales.read'), async (req, res) => {
  const saleId = Number(req.params.id);
  const { rows } = await req.db.execute({
    sql: `SELECT s.id, s.invoice_number AS invoiceNumber, s.created_at AS createdAt, s.subtotal,
      s.discount_amount AS discountAmount, s.total, s.cash_received AS cashReceived,
      s.payment_method AS paymentMethod, COALESCE(c.name, '') AS customer,
      COALESCE((SELECT SUM(p.amount) FROM customer_payments p WHERE p.sale_id=s.id),0) AS paidTotal,
      COALESCE((SELECT SUM(r.total_refund) FROM sale_returns r WHERE r.sale_id=s.id),0) AS returnedTotal
      FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?`, args: [saleId],
  });
  if (!rows.length) return res.sendStatus(404);
  const { rows: lines } = await req.db.execute({
    sql: `SELECT sl.id AS saleLineId, m.name AS medicine, b.number AS batch, sl.quantity,
      sl.returned_quantity AS returnedQuantity, sl.unit_price AS unitPrice, sl.discount_amount AS discountAmount,
      sl.unit_price * sl.quantity - sl.discount_amount AS total FROM sale_lines sl
      JOIN batches b ON b.id=sl.batch_id JOIN medicines m ON m.id=b.medicine_id WHERE sl.sale_id=? ORDER BY sl.id`, args: [saleId],
  });
  res.json({ ...rows[0], customer: rows[0].customer || null, lines });
});

router.post('/:id/returns', requirePermission('sales.manage'), async (req, res) => {
  const saleId = Number(req.params.id);
  const reason = String(req.body?.reason ?? '').trim();
  const refundMethodInput = String(req.body?.refundMethod ?? '').trim();
  const refundMethod = returnMethods.find((value) => value.toLowerCase() === refundMethodInput.toLowerCase());
  const inputs = Array.isArray(req.body?.lines) ? req.body.lines : [];
  if (!reason || !inputs.length || inputs.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0) || !refundMethod) return res.status(400).json({ message: 'Return reason, positive quantities and a supported refund method are required.' });
  const grouped = new Map();
  for (const line of inputs) {
    const key = `${Number(line.saleLineId)}:${Boolean(line.restock)}`;
    const current = grouped.get(key) ?? { id: Number(line.saleLineId), restock: Boolean(line.restock), quantity: 0 };
    current.quantity += Number(line.quantity); grouped.set(key, current);
  }
  const requestedBySaleLine = new Map();
  for (const item of grouped.values()) requestedBySaleLine.set(item.id, (requestedBySaleLine.get(item.id) ?? 0) + item.quantity);
  const tx = await req.db.transaction('write');
  try {
    const sale = await tx.execute({ sql: 'SELECT id FROM sales WHERE id=?', args: [saleId] });
    if (!sale.rows.length) { await tx.rollback(); return res.sendStatus(404); }
    const { rows } = await tx.execute({
      sql: `SELECT sl.id, sl.quantity, sl.returned_quantity AS returnedQuantity,
        sl.unit_price AS unitPrice, sl.discount_amount AS discountAmount, sl.batch_id AS batchId,
        b.expiry_date AS expiryDate, b.quantity AS stock FROM sale_lines sl JOIN batches b ON b.id=sl.batch_id WHERE sl.sale_id=?`, args: [saleId],
    });
    const byId = new Map(rows.map((line) => [Number(line.id), line]));
    for (const [saleLineId, requestedQuantity] of requestedBySaleLine) {
      const line = byId.get(saleLineId);
      if (!line) { await tx.rollback(); return res.status(400).json({ message: 'Sale line does not belong to this invoice.' }); }
      if (requestedQuantity > Number(line.quantity) - Number(line.returnedQuantity)) { await tx.rollback(); return res.status(409).json({ message: 'Return quantity exceeds the unreturned quantity sold.' }); }
      if ([...grouped.values()].some((item) => item.id === saleLineId && item.restock) && line.expiryDate <= new Date().toISOString().slice(0, 10)) { await tx.rollback(); return res.status(409).json({ message: 'Expired stock cannot be returned to saleable inventory.' }); }
    }
    const result = await tx.execute({ sql: 'INSERT INTO sale_returns(sale_id, reason, refund_method, total_refund) VALUES(?, ?, ?, 0) RETURNING id', args: [saleId, reason, refundMethod] });
    const returnId = Number(result.rows[0].id);
    let totalRefund = 0;
    for (const item of grouped.values()) {
      const line = byId.get(item.id);
      const unitRefund = Math.max(0, Number(line.unitPrice) - Number(line.discountAmount) / Number(line.quantity));
      let balance = Number(line.stock);
      if (item.restock) {
        const batchUpdate = await tx.execute({ sql: 'UPDATE batches SET quantity=quantity+?, version=version+1 WHERE id=? RETURNING quantity', args: [item.quantity, line.batchId] });
        balance = Number(batchUpdate.rows[0].quantity);
      }
      await tx.execute({ sql: 'UPDATE sale_lines SET returned_quantity=returned_quantity+? WHERE id=?', args: [item.quantity, item.id] });
      await tx.execute({ sql: 'INSERT INTO sale_return_lines(sale_return_id, sale_line_id, batch_id, quantity, restocked, unit_refund) VALUES(?, ?, ?, ?, ?, ?)', args: [returnId, item.id, line.batchId, item.quantity, item.restock ? 1 : 0, unitRefund] });
      await tx.execute({ sql: `INSERT INTO stock_movements(batch_id, type, reference_id, quantity_change, balance_after, reason, actor_id) VALUES(?, ?, ?, ?, ?, ?, ?)`, args: [line.batchId, item.restock ? 'SaleReturn' : 'DamagedReturn', saleId, item.restock ? item.quantity : 0, balance, reason, req.auth.userId] });
      totalRefund += item.quantity * unitRefund;
    }
    totalRefund = roundMoney(totalRefund);
    await tx.execute({ sql: 'UPDATE sale_returns SET total_refund=? WHERE id=?', args: [totalRefund, returnId] });
    await tx.commit();
    res.status(201).location(`/api/sales/${saleId}/returns/${returnId}`).json({ id: returnId, totalRefund, refundMethod });
  } catch (error) { await tx.rollback(); throw error; }
});

export default router;
