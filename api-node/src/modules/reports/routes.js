import { Router } from 'express';
import { authenticate, requirePermission, requireStore } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate, requireStore);
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

router.get('/dashboard', requirePermission('reports.read'), async (req, res) => {
  if (req.auth.subscriptionExpired) return res.json({ todaySales: 0, todayInvoices: 0, medicineCount: 0, expiringBatches: 0, expiredBatches: 0, subscriptionExpiresAt: req.store.trialEndsAt ?? req.store.subscriptionExpiresAt, subscriptionDaysRemaining: null, subscriptionExpired: true });
  const expiry = req.store.subscriptionStatus === 'Trial' ? req.store.trialEndsAt : req.store.subscriptionExpiresAt;
  const [sales, medicines, expiryCounts] = await Promise.all([
    req.db.execute({ sql: `SELECT COALESCE(SUM(total),0) AS todaySales, COUNT(*) AS todayInvoices FROM sales WHERE date(created_at)=date('now')` }),
    req.db.execute('SELECT COUNT(*) AS medicineCount FROM medicines'),
    req.db.execute(`SELECT SUM(CASE WHEN expiry_date > date('now') AND expiry_date <= date('now','+60 days') THEN 1 ELSE 0 END) AS expiring,
      SUM(CASE WHEN expiry_date <= date('now') THEN 1 ELSE 0 END) AS expired FROM batches WHERE quantity>0`),
  ]);
  const remaining = expiry && Date.parse(expiry) > Date.now() && Date.parse(expiry) <= Date.now() + 5 * 86400_000 ? Math.ceil((Date.parse(expiry) - Date.now()) / 86400_000) : null;
  res.json({ todaySales: Number(sales.rows[0].todaySales), todayInvoices: Number(sales.rows[0].todayInvoices), medicineCount: Number(medicines.rows[0].medicineCount), expiringBatches: Number(expiryCounts.rows[0].expiring ?? 0), expiredBatches: Number(expiryCounts.rows[0].expired ?? 0), subscriptionExpiresAt: expiry ?? null, subscriptionDaysRemaining: remaining, subscriptionExpired: false });
});

async function buildReport(db, from, to) {
  const sales = await db.execute({
    sql: `SELECT s.id, s.invoice_number AS invoiceNumber, s.created_at AS createdAt,
      c.name AS customer, s.payment_method AS paymentMethod, s.subtotal, s.discount_amount AS discountAmount, s.total,
      COALESCE((SELECT SUM(r.total_refund) FROM sale_returns r WHERE r.sale_id=s.id),0) AS returned,
      COALESCE((SELECT SUM(sl.unit_cost*sl.quantity) FROM sale_lines sl WHERE sl.sale_id=s.id),0) -
      COALESCE((SELECT SUM(srl.quantity*sl.unit_cost) FROM sale_return_lines srl JOIN sale_lines sl ON sl.id=srl.sale_line_id WHERE srl.restocked=1 AND sl.sale_id=s.id),0) AS cost,
      COALESCE((SELECT SUM(sl.unit_price*sl.quantity-sl.discount_amount) FROM sale_lines sl WHERE sl.sale_id=s.id),0) -
      COALESCE((SELECT SUM(r.total_refund) FROM sale_returns r WHERE r.sale_id=s.id),0) AS netSales
      FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
      WHERE (? IS NULL OR date(s.created_at)>=?) AND (? IS NULL OR date(s.created_at)<=?) ORDER BY s.created_at DESC`, args: [from, from, to, to],
  });
  const inventory = await db.execute({
    sql: `SELECT m.name AS medicine, b.number AS batch, b.expiry_date AS expiryDate, b.quantity,
      b.cost_price AS costPrice, b.sale_price AS salePrice, b.cost_price*b.quantity AS costValue,
      b.sale_price*b.quantity AS saleValue FROM batches b JOIN medicines m ON m.id=b.medicine_id
      WHERE b.quantity>0 ORDER BY m.name COLLATE NOCASE, b.expiry_date`,
  });
  const expenses = await db.execute({
    sql: `SELECT e.expense_date AS expenseDate, c.name AS category, e.description,
      e.payment_method AS paymentMethod, e.reference, e.amount FROM expenses e
      JOIN expense_categories c ON c.id=e.category_id WHERE (? IS NULL OR e.expense_date>=?)
      AND (? IS NULL OR e.expense_date<=?) ORDER BY e.expense_date DESC`, args: [from, from, to, to],
  });
  const saleRows = sales.rows.map((sale) => ({ ...sale, subtotal: Number(sale.subtotal), discountAmount: Number(sale.discountAmount), total: Number(sale.total), returned: Number(sale.returned), cost: money(sale.cost), netSales: money(sale.netSales) }));
  const inventoryRows = inventory.rows.map((item) => ({ ...item, quantity: Number(item.quantity), costPrice: Number(item.costPrice), salePrice: Number(item.salePrice), costValue: Number(item.costValue), saleValue: Number(item.saleValue) }));
  const expenseRows = expenses.rows.map((item) => ({ ...item, amount: Number(item.amount) }));
  const netSales = money(saleRows.reduce((sum, sale) => sum + sale.netSales, 0));
  const costOfGoods = money(saleRows.reduce((sum, sale) => sum + sale.cost, 0));
  const expenseTotal = money(expenseRows.reduce((sum, expense) => sum + expense.amount, 0));
  return { from, to, sales: saleRows, inventory: inventoryRows, expenses: expenseRows, netSales, costOfGoods, expenseTotal, netProfit: money(netSales - costOfGoods - expenseTotal), returnedTotal: money(saleRows.reduce((sum, sale) => sum + sale.returned, 0)), inventoryCostValue: money(inventoryRows.reduce((sum, item) => sum + item.costValue, 0)), inventorySaleValue: money(inventoryRows.reduce((sum, item) => sum + item.saleValue, 0)) };
}

function validDateFilter(req, res) {
  const from = req.query.from ? String(req.query.from) : null, to = req.query.to ? String(req.query.to) : null;
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) { res.status(400).send('Use valid YYYY-MM-DD dates.'); return null; }
  if (from && to && from > to) { res.status(400).send('From date must be on or before To date.'); return null; }
  return { from, to };
}

router.get('/reports/details', requirePermission('reports.read'), async (req, res) => {
  const range = validDateFilter(req, res); if (!range) return;
  res.json(await buildReport(req.db, range.from, range.to));
});

router.get('/reports/payables', requirePermission('reports.read'), async (req, res) => {
  const { rows: suppliers } = await req.db.execute('SELECT id, name FROM suppliers ORDER BY name COLLATE NOCASE');
  const accounts = [];
  for (const supplier of suppliers) {
    const { rows: invoices } = await req.db.execute({
      sql: `SELECT p.id, p.supplier_invoice AS supplierInvoice, p.created_at AS createdAt, p.total,
        COALESCE((SELECT SUM(total) FROM purchase_returns WHERE purchase_id=p.id),0) AS returned,
        COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE purchase_id=p.id),0) AS paid,
        COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE purchase_id=p.id AND method <> 'Supplier Credit'),0) AS externalPaid
        FROM purchases p WHERE p.supplier_id=? ORDER BY p.created_at DESC`, args: [supplier.id],
    });
    const shaped = [];
    for (const invoice of invoices) {
      const [returns, payments] = await Promise.all([
        req.db.execute({ sql: 'SELECT created_at AS createdAt, supplier_reference AS supplierReference, reason, total AS amount FROM purchase_returns WHERE purchase_id=? ORDER BY created_at DESC', args: [invoice.id] }),
        req.db.execute({ sql: 'SELECT paid_at AS paidAt, amount, method, reference FROM supplier_payments WHERE purchase_id=? ORDER BY paid_at DESC', args: [invoice.id] }),
      ]);
      shaped.push({ ...invoice, id: Number(invoice.id), total: Number(invoice.total), returned: Number(invoice.returned), paid: Number(invoice.paid), balance: Math.max(0, Number(invoice.total) - Number(invoice.returned) - Number(invoice.paid)), returns: returns.rows, payments: payments.rows });
      invoice.returns = Number(invoice.returned); invoice.externalPaid = Number(invoice.externalPaid);
    }
    const purchaseTotal = money(invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0));
    const returnedTotal = money(invoices.reduce((sum, invoice) => sum + Number(invoice.returned), 0));
    const paidTotal = money(invoices.reduce((sum, invoice) => sum + Number(invoice.externalPaid), 0));
    const balance = money(purchaseTotal - returnedTotal - paidTotal);
    accounts.push({ supplierId: Number(supplier.id), supplier: supplier.name, invoiceCount: invoices.length, purchaseTotal, returnedTotal, paidTotal, balance, payableAmount: Math.max(0, balance), receivableAmount: Math.max(0, -balance), invoices: shaped });
  }
  res.json({ payableTotal: money(accounts.reduce((sum, item) => sum + item.payableAmount, 0)), supplierCreditTotal: money(accounts.reduce((sum, item) => sum + item.receivableAmount, 0)), suppliers: accounts });
});

router.get('/reports/receivables', requirePermission('reports.read'), async (req, res) => {
  const { rows: customers } = await req.db.execute('SELECT id, name, phone, email, is_active AS isActive FROM customers ORDER BY name COLLATE NOCASE');
  const accounts = [];
  for (const customer of customers) {
    const { rows } = await req.db.execute({
      sql: `SELECT s.id, s.invoice_number AS invoiceNumber, s.created_at AS createdAt, s.total, s.payment_method AS paymentMethod,
        COALESCE((SELECT SUM(total_refund) FROM sale_returns WHERE sale_id=s.id),0) AS returned,
        COALESCE((SELECT SUM(amount) FROM customer_payments WHERE sale_id=s.id),0) AS paid
        FROM sales s WHERE s.customer_id=? ORDER BY s.created_at DESC`, args: [customer.id],
    });
    const invoices = [];
    for (const invoice of rows) {
      const [returns, payments] = await Promise.all([
        req.db.execute({ sql: 'SELECT created_at AS createdAt, total_refund AS totalRefund, refund_method AS refundMethod, reason FROM sale_returns WHERE sale_id=? ORDER BY created_at DESC', args: [invoice.id] }),
        req.db.execute({ sql: 'SELECT paid_at AS paidAt, amount, method, reference FROM customer_payments WHERE sale_id=? ORDER BY paid_at DESC', args: [invoice.id] }),
      ]);
      const creditSale = ['Not Received', 'Credit'].includes(invoice.paymentMethod);
      const net = Math.max(0, Number(invoice.total) - Number(invoice.returned));
      invoices.push({ id: Number(invoice.id), invoiceNumber: invoice.invoiceNumber, createdAt: invoice.createdAt, total: Number(invoice.total), paymentMethod: invoice.paymentMethod, returned: Number(invoice.returned), paid: creditSale ? Math.min(Number(invoice.paid), net) : net, due: creditSale ? Math.max(0, net - Number(invoice.paid)) : 0, returns: returns.rows, payments: payments.rows });
    }
    const paidTotal = money(invoices.reduce((sum, invoice) => sum + invoice.paid, 0));
    const amountDue = money(invoices.reduce((sum, invoice) => sum + invoice.due, 0));
    accounts.push({ customerId: Number(customer.id), customer: customer.name, phone: customer.phone, email: customer.email, isActive: customer.isActive, paidTotal, amountDue, invoiceCount: invoices.filter((invoice) => invoice.due > 0).length, invoices });
  }
  res.json({ totalReceivable: money(accounts.reduce((sum, item) => sum + item.amountDue, 0)), customers: accounts });
});

function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function csvRow(values) { return values.map(csvCell).join(','); }

router.get('/reports/export', requirePermission('reports.read'), async (req, res) => {
  const range = validDateFilter(req, res); if (!range) return;
  const type = String(req.query.type ?? '').toLowerCase();
  const report = await buildReport(req.db, range.from, range.to);
  const lines = [];
  if (type === 'sales') {
    lines.push('Invoice,Date,Customer,Payment Method,Subtotal,Discount,Total,Returned,Net Sales,Cost,Profit');
    for (const sale of report.sales) lines.push(csvRow([sale.invoiceNumber, sale.createdAt, sale.customer ?? 'Walk-in', sale.paymentMethod, sale.subtotal, sale.discountAmount, sale.total, sale.returned, sale.netSales, sale.cost, money(sale.netSales - sale.cost)]));
  } else if (type === 'inventory') {
    lines.push('Medicine,Batch,Expiry,Quantity,Cost Price,Sale Price,Cost Value,Sale Value');
    for (const item of report.inventory) lines.push(csvRow([item.medicine, item.batch, item.expiryDate, item.quantity, item.costPrice, item.salePrice, item.costValue, item.saleValue]));
  } else if (type === 'expenses') {
    lines.push('Date,Category,Description,Payment Method,Reference,Amount');
    for (const item of report.expenses) lines.push(csvRow([item.expenseDate, item.category, item.description, item.paymentMethod, item.reference, item.amount]));
  } else if (type === 'profit') {
    lines.push('From,To,Net Sales,Cost of Goods,Expenses,Net Profit');
    lines.push(csvRow([report.from, report.to, report.netSales, report.costOfGoods, report.expenseTotal, report.netProfit]));
  } else return res.status(400).send('Choose sales, inventory, expenses or profit export.');
  res.type('text/csv; charset=utf-8').attachment(`${type}-report.csv`).send(`\uFEFF${lines.join('\r\n')}`);
});

export default router;
