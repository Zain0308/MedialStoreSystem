import { Router } from 'express';
import { authenticate, requirePermission, requireStore } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate, requireStore);
const paidByReceiptMethods = ['Not Received', 'Credit'];
const paymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet'];
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

router.get('/', requirePermission('customers.read'), async (req, res) => {
  const { rows } = await req.db.execute(`SELECT c.id, c.name, c.phone, c.email, c.is_active AS isActive,
    COALESCE(SUM(CASE WHEN s.payment_method IN ('Not Received','Credit')
      THEN MIN(COALESCE(s.total-r.returned,0), COALESCE(p.paid,0))
      ELSE MAX(COALESCE(s.total-r.returned,0),0) END),0) AS paidTotal,
    COALESCE(SUM(CASE WHEN s.payment_method IN ('Not Received','Credit')
      THEN MAX(COALESCE(s.total-r.returned,0)-COALESCE(p.paid,0),0) ELSE 0 END),0) AS receivable
    FROM customers c LEFT JOIN sales s ON s.customer_id=c.id
    LEFT JOIN (SELECT sale_id, SUM(total_refund) AS returned FROM sale_returns GROUP BY sale_id) r ON r.sale_id=s.id
    LEFT JOIN (SELECT sale_id, SUM(amount) AS paid FROM customer_payments GROUP BY sale_id) p ON p.sale_id=s.id
    GROUP BY c.id ORDER BY c.name COLLATE NOCASE`);
  res.json(rows.map((row) => ({ ...row, paidTotal: roundMoney(row.paidTotal), receivable: roundMoney(row.receivable) })));
});

function input(body) {
  const clean = (value) => value == null || String(value).trim() === '' ? null : String(value).trim();
  return { name: String(body?.name ?? '').trim(), phone: clean(body?.phone), email: clean(body?.email) };
}
function valid(value) { return value.name.length > 0 && value.name.length <= 200 && (!value.phone || value.phone.length <= 40) && (!value.email || value.email.length <= 254); }

router.post('/', requirePermission('customers.manage'), async (req, res) => {
  const value = input(req.body);
  if (!valid(value)) return res.status(400).json({ message: 'Enter a customer name and valid contact details.' });
  const { rows } = await req.db.execute({ sql: 'INSERT INTO customers(name, phone, email) VALUES(?, ?, ?) RETURNING id', args: [value.name, value.phone, value.email] });
  res.status(201).location(`/api/customers/${rows[0].id}`).json({ id: Number(rows[0].id) });
});

router.put('/:id', requirePermission('customers.manage'), async (req, res) => {
  const id = Number(req.params.id), value = input(req.body);
  if (!valid(value)) return res.status(400).json({ message: 'Enter a customer name and valid contact details.' });
  const { rows } = await req.db.execute({ sql: 'UPDATE customers SET name=?, phone=?, email=? WHERE id=? RETURNING id, name, phone, email, is_active AS isActive', args: [value.name, value.phone, value.email, id] });
  if (!rows.length) return res.sendStatus(404);
  res.json(rows[0]);
});

router.put('/:id/status', requirePermission('customers.manage'), async (req, res) => {
  if (typeof req.body?.isActive !== 'boolean') return res.status(400).json({ message: 'Set customer status.' });
  const id = Number(req.params.id);
  const { rows } = await req.db.execute({ sql: 'UPDATE customers SET is_active=? WHERE id=? RETURNING id', args: [req.body.isActive ? 1 : 0, id] });
  if (!rows.length) return res.sendStatus(404);
  res.json({ id, isActive: req.body.isActive });
});

router.get('/:id/ledger', requirePermission('customers.read'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows: customers } = await req.db.execute({ sql: 'SELECT id, name, phone, email, is_active AS isActive FROM customers WHERE id=?', args: [id] });
  if (!customers.length) return res.sendStatus(404);
  const { rows: sales } = await req.db.execute({
    sql: `SELECT s.id, s.invoice_number AS invoiceNumber, s.created_at AS createdAt, s.total,
      s.payment_method AS paymentMethod,
      COALESCE((SELECT SUM(total_refund) FROM sale_returns WHERE sale_id=s.id),0) AS returned,
      COALESCE((SELECT SUM(amount) FROM customer_payments WHERE sale_id=s.id),0) AS paid
      FROM sales s WHERE s.customer_id=? ORDER BY s.created_at DESC`, args: [id],
  });
  const invoices = [];
  let paidTotal = 0;
  for (const sale of sales) {
    const isCreditMethod = paidByReceiptMethods.includes(sale.paymentMethod);
    const net = Math.max(0, Number(sale.total) - Number(sale.returned));
    const paid = isCreditMethod ? Math.min(Number(sale.paid), net) : net;
    const due = isCreditMethod ? Math.max(0, net - Number(sale.paid)) : 0;
    paidTotal += paid;
    const [returns, payments] = await Promise.all([
      req.db.execute({ sql: 'SELECT id, created_at AS createdAt, reason, refund_method AS refundMethod, total_refund AS totalRefund FROM sale_returns WHERE sale_id=? ORDER BY created_at DESC', args: [sale.id] }),
      req.db.execute({ sql: 'SELECT id, amount, method, reference, paid_at AS paidAt FROM customer_payments WHERE sale_id=? ORDER BY paid_at DESC', args: [sale.id] }),
    ]);
    invoices.push({ id: Number(sale.id), invoiceNumber: sale.invoiceNumber, createdAt: sale.createdAt, total: Number(sale.total), paymentMethod: sale.paymentMethod,
      returned: Number(sale.returned), paid, due: roundMoney(due), returns: returns.rows, payments: payments.rows });
  }
  res.json({ customer: customers[0], invoices, paidTotal: roundMoney(paidTotal), receivable: roundMoney(invoices.reduce((sum, invoice) => sum + invoice.due, 0)) });
});

router.post('/:id/payments', requirePermission('customers.manage'), async (req, res) => {
  const customerId = Number(req.params.id);
  const saleId = Number(req.body?.saleId);
  const amount = roundMoney(Number(req.body?.amount));
  const methodText = String(req.body?.method ?? '').trim();
  const method = paymentMethods.find((value) => value.toLowerCase() === methodText.toLowerCase());
  if (amount <= 0 || !method) return res.status(400).json({ message: 'Payment amount and a supported payment method are required.' });
  const tx = await req.db.transaction('write');
  try {
    const { rows } = await tx.execute({
      sql: `SELECT s.id, s.total, COALESCE((SELECT SUM(r.total_refund) FROM sale_returns r WHERE r.sale_id=s.id),0) AS returned,
        COALESCE((SELECT SUM(p.amount) FROM customer_payments p WHERE p.sale_id=s.id),0) AS paid
        FROM sales s WHERE s.id=? AND s.customer_id=? AND s.payment_method IN ('Not Received','Credit')`, args: [saleId, customerId],
    });
    if (!rows.length) { await tx.rollback(); return res.status(404).send('Unpaid invoice not found for this customer.'); }
    const due = Math.max(0, Number(rows[0].total) - Number(rows[0].returned) - Number(rows[0].paid));
    if (amount > due) { await tx.rollback(); return res.status(409).json({ message: `Payment cannot exceed the invoice balance of ${due.toFixed(2)}.` }); }
    const payment = await tx.execute({ sql: 'INSERT INTO customer_payments(customer_id, sale_id, amount, method, reference) VALUES(?, ?, ?, ?, ?) RETURNING id', args: [customerId, saleId, amount, method, String(req.body?.reference ?? '').trim() || null] });
    await tx.commit();
    res.status(201).location(`/api/customers/${customerId}/payments/${payment.rows[0].id}`).json({ id: Number(payment.rows[0].id), amount, due: roundMoney(due - amount) });
  } catch (error) { await tx.rollback(); throw error; }
});

export default router;
