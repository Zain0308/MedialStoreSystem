import { Router } from 'express';
import { authenticate, requirePermission, requireStore } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate, requireStore);

router.get('/', requirePermission('medicines.read'), async (req, res) => {
  const { rows } = await req.db.execute({
    sql: `SELECT m.id, m.name, m.generic_name AS genericName, m.barcode, m.strength, m.dosage_form AS dosageForm,
      m.manufacturer, m.description, m.requires_prescription AS requiresPrescription,
      m.minimum_stock AS minimumStock, m.is_active AS isActive,
      COALESCE((SELECT SUM(b.quantity) FROM batches b WHERE b.medicine_id = m.id AND b.expiry_date > date('now')), 0) AS stock
      FROM medicines m ORDER BY m.name COLLATE NOCASE`,
  });
  res.json(rows);
});

function medicineInput(body) {
  return {
    name: String(body?.name ?? '').trim(),
    genericName: clean(body?.genericName), barcode: clean(body?.barcode),
    strength: clean(body?.strength), dosageForm: clean(body?.dosageForm),
    manufacturer: clean(body?.manufacturer), description: clean(body?.description),
    minimumStock: Number(body?.minimumStock ?? 0), requiresPrescription: Boolean(body?.requiresPrescription),
  };
}
function clean(value) { return value == null || String(value).trim() === '' ? null : String(value).trim(); }
function validMedicine(value) {
  return value.name.length > 0 && value.name.length <= 200 && Number.isInteger(value.minimumStock) && value.minimumStock >= 0 &&
    (!value.genericName || value.genericName.length <= 200) && (!value.barcode || value.barcode.length <= 100) &&
    (!value.strength || value.strength.length <= 80) && (!value.dosageForm || value.dosageForm.length <= 80) &&
    (!value.manufacturer || value.manufacturer.length <= 160) && (!value.description || value.description.length <= 1000);
}

async function duplicate(db, value, exceptId = 0) {
  const { rows } = await db.execute({
    sql: `SELECT id FROM medicines WHERE id <> ? AND upper(trim(name)) = upper(?)
      AND upper(trim(COALESCE(generic_name,''))) = upper(?)
      AND upper(trim(COALESCE(strength,''))) = upper(?)
      AND upper(trim(COALESCE(dosage_form,''))) = upper(?) LIMIT 1`,
    args: [exceptId, value.name, value.genericName ?? '', value.strength ?? '', value.dosageForm ?? ''],
  });
  return rows.length > 0;
}

router.post('/', requirePermission('medicines.manage'), async (req, res) => {
  const value = medicineInput(req.body);
  if (!validMedicine(value)) return res.status(400).json({ message: 'Medicine name and details must fit the allowed lengths; minimum stock cannot be negative.' });
  if (value.barcode) {
    const { rows } = await req.db.execute({ sql: 'SELECT id FROM medicines WHERE barcode = ?', args: [value.barcode] });
    if (rows.length) return res.status(409).json({ message: 'Barcode already exists.' });
  }
  if (await duplicate(req.db, value)) return res.status(409).json({ message: 'A medicine with this name, generic name, strength and dosage form already exists in this store. Select the existing medicine for the purchase.' });
  const { rows } = await req.db.execute({
    sql: `INSERT INTO medicines(name, generic_name, barcode, strength, dosage_form, manufacturer, description, requires_prescription, minimum_stock)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [value.name, value.genericName, value.barcode, value.strength, value.dosageForm, value.manufacturer, value.description, value.requiresPrescription ? 1 : 0, value.minimumStock],
  });
  res.status(201).location(`/api/medicines/${rows[0].id}`).json({ id: Number(rows[0].id) });
});

router.put('/:id', requirePermission('medicines.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const value = medicineInput(req.body);
  if (!Number.isSafeInteger(id) || !validMedicine(value)) return res.status(400).json({ message: 'Medicine name and details must fit the allowed lengths; minimum stock cannot be negative.' });
  const current = await req.db.execute({ sql: 'SELECT id FROM medicines WHERE id = ?', args: [id] });
  if (!current.rows.length) return res.sendStatus(404);
  if (value.barcode) {
    const { rows } = await req.db.execute({ sql: 'SELECT id FROM medicines WHERE barcode = ? AND id <> ?', args: [value.barcode, id] });
    if (rows.length) return res.status(409).json({ message: 'Barcode already exists.' });
  }
  if (await duplicate(req.db, value, id)) return res.status(409).json({ message: 'A medicine with this name, generic name, strength and dosage form already exists in this store.' });
  await req.db.execute({
    sql: `UPDATE medicines SET name=?, generic_name=?, barcode=?, strength=?, dosage_form=?, manufacturer=?, description=?,
      requires_prescription=?, minimum_stock=? WHERE id=?`,
    args: [value.name, value.genericName, value.barcode, value.strength, value.dosageForm, value.manufacturer, value.description, value.requiresPrescription ? 1 : 0, value.minimumStock, id],
  });
  res.json({ id });
});

router.put('/:id/status', requirePermission('medicines.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const isActive = req.body?.isActive;
  if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'Set medicine status.' });
  const { rows } = await req.db.execute({ sql: 'UPDATE medicines SET is_active=? WHERE id=? RETURNING id', args: [isActive ? 1 : 0, id] });
  if (!rows.length) return res.sendStatus(404);
  res.json({ id, isActive });
});

export default router;
