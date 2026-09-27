import { Router } from 'express';
import { authenticate, requirePermission, requireStore } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate, requireStore);
const methods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet'];

router.get('/categories', requirePermission('expenses.read'), async (req, res) => {
  const { rows } = await req.db.execute('SELECT id, name, is_active AS isActive FROM expense_categories ORDER BY name COLLATE NOCASE');
  res.json(rows);
});

router.post('/categories', requirePermission('expenses.manage'), async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name || name.length > 100) return res.status(400).json({ message: 'Category name is required (up to 100 characters).' });
  try {
    const { rows } = await req.db.execute({ sql: 'INSERT INTO expense_categories(name) VALUES(?) RETURNING id, name, is_active AS isActive', args: [name] });
    res.status(201).location(`/api/expenses/categories/${rows[0].id}`).json(rows[0]);
  } catch (error) { if (String(error.message).includes('UNIQUE')) return res.status(409).json({ message: 'That category already exists.' }); throw error; }
});

router.put('/categories/:id/status', requirePermission('expenses.manage'), async (req, res) => {
  const isActive = req.body?.isActive;
  if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'Set category status.' });
  const { rows } = await req.db.execute({ sql: 'UPDATE expense_categories SET is_active=? WHERE id=? RETURNING id, name, is_active AS isActive', args: [isActive ? 1 : 0, Number(req.params.id)] });
  if (!rows.length) return res.sendStatus(404);
  res.json(rows[0]);
});

router.get('/', requirePermission('expenses.read'), async (req, res) => {
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
  if (from && to && from > to) return res.status(400).send('From date must be on or before To date.');
  const { rows } = await req.db.execute({
    sql: `SELECT e.id, e.category_id AS categoryId, c.name AS category, e.description, e.amount,
      e.expense_date AS expenseDate, e.payment_method AS paymentMethod, e.reference, e.notes
      FROM expenses e JOIN expense_categories c ON c.id=e.category_id
      WHERE (? IS NULL OR e.expense_date>=?) AND (? IS NULL OR e.expense_date<=?) AND (? IS NULL OR e.category_id=?)
      ORDER BY e.expense_date DESC, e.id DESC`, args: [from, from, to, to, categoryId, categoryId],
  });
  res.json(rows);
});

router.post('/', requirePermission('expenses.manage'), async (req, res) => {
  const categoryId = Number(req.body?.categoryId);
  const description = String(req.body?.description ?? '').trim();
  const amount = Math.round((Number(req.body?.amount) + Number.EPSILON) * 100) / 100;
  const date = String(req.body?.expenseDate ?? '');
  const methodInput = String(req.body?.paymentMethod ?? '').trim();
  const method = methods.find((value) => value.toLowerCase() === methodInput.toLowerCase());
  const reference = req.body?.reference == null || String(req.body.reference).trim() === '' ? null : String(req.body.reference).trim();
  const notes = req.body?.notes == null || String(req.body.notes).trim() === '' ? null : String(req.body.notes).trim();
  if (!Number.isSafeInteger(categoryId) || amount <= 0 || amount >= 1_000_000_000 || !description || description.length > 240 || !method || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (reference && reference.length > 100) || (notes && notes.length > 500)) return res.status(400).json({ message: 'Enter a description, positive amount, supported payment method and valid optional details.' });
  const category = await req.db.execute({ sql: 'SELECT id FROM expense_categories WHERE id=? AND is_active=1', args: [categoryId] });
  if (!category.rows.length) return res.status(400).json({ message: 'Select an active expense category.' });
  const { rows } = await req.db.execute({ sql: `INSERT INTO expenses(category_id, description, amount, expense_date, payment_method, reference, notes, actor_id) VALUES(?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, args: [categoryId, description, amount, date, method, reference, notes, req.auth.userId] });
  res.status(201).location(`/api/expenses/${rows[0].id}`).json({ id: Number(rows[0].id) });
});

export default router;
