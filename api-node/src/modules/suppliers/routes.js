import { Router } from 'express';
import { authenticate, requirePermission, requireStore } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate, requireStore);

router.get('/', requirePermission('suppliers.read'), async (req, res) => {
  const { rows } = await req.db.execute(`SELECT id, name, phone, contact_person AS contactPerson, email, address, is_active AS isActive
    FROM suppliers ORDER BY name COLLATE NOCASE`);
  res.json(rows);
});

function supplierInput(body) {
  const trimOrNull = (value) => value == null || String(value).trim() === '' ? null : String(value).trim();
  return {
    name: String(body?.name ?? '').trim(), phone: trimOrNull(body?.phone),
    contactPerson: trimOrNull(body?.contactPerson), email: trimOrNull(body?.email), address: trimOrNull(body?.address),
  };
}
function valid(value) {
  return value.name.length > 0 && value.name.length <= 200 && (!value.phone || value.phone.length <= 40) &&
    (!value.contactPerson || value.contactPerson.length <= 120) && (!value.email || value.email.length <= 254) &&
    (!value.address || value.address.length <= 300);
}

router.post('/', requirePermission('suppliers.manage'), async (req, res) => {
  const value = supplierInput(req.body);
  if (!valid(value)) return res.status(400).json({ message: 'Enter a supplier name and keep the optional details within their length limits.' });
  const { rows } = await req.db.execute({
    sql: 'INSERT INTO suppliers(name, phone, contact_person, email, address) VALUES(?, ?, ?, ?, ?) RETURNING id',
    args: [value.name, value.phone, value.contactPerson, value.email, value.address],
  });
  res.status(201).location(`/api/suppliers/${rows[0].id}`).json({ id: Number(rows[0].id) });
});

router.put('/:id', requirePermission('suppliers.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const value = supplierInput(req.body);
  if (!Number.isSafeInteger(id) || !valid(value)) return res.status(400).json({ message: 'Enter a supplier name and keep the optional details within their length limits.' });
  const { rows } = await req.db.execute({
    sql: `UPDATE suppliers SET name=?, phone=?, contact_person=?, email=?, address=? WHERE id=?
      RETURNING id, name, phone, contact_person AS contactPerson, email, address, is_active AS isActive`,
    args: [value.name, value.phone, value.contactPerson, value.email, value.address, id],
  });
  if (!rows.length) return res.sendStatus(404);
  res.json(rows[0]);
});

router.put('/:id/status', requirePermission('suppliers.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (typeof req.body?.isActive !== 'boolean') return res.status(400).json({ message: 'Set supplier status.' });
  const { rows } = await req.db.execute({ sql: 'UPDATE suppliers SET is_active=? WHERE id=? RETURNING id', args: [req.body.isActive ? 1 : 0, id] });
  if (!rows.length) return res.sendStatus(404);
  res.json({ id, isActive: req.body.isActive });
});

export default router;
