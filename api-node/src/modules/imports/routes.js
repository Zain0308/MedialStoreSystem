import { Router } from 'express';
import * as XLSX from 'xlsx';
import { authenticate, requireStore } from '../../middleware/auth.js';
import { controlDb } from '../../db/control.js';

const router = Router();
router.use(authenticate, requireStore);
const requiredPermissions = ['medicines.manage', 'suppliers.manage', 'inventory.manage'];
const headers = ['MedicineName','GenericName','Strength','DosageForm','Manufacturer','Barcode','MinimumStock','RequiresPrescription','SupplierName','ContactPerson','Phone','Email','Address','BatchNumber','ExpiryDate','OpeningQuantity','UnitCost','SalePrice'];
const template = `${headers.join(',')}\r\nParacetamol,Paracetamol,500 mg,Tablet,Example Pharma,,10,false,ABC Pharma,Ali Khan,03001234567,,Karachi,LOT-001,2027-12-31,100,10,15\r\n`;
const key = (value) => String(value ?? '').trim().toUpperCase();
const clean = (value) => String(value ?? '').trim() || null;
const medicineKey = (item) => [item.MedicineName, item.GenericName, item.Strength, item.DosageForm].map(key).join('\u001f');

async function canImport(req) {
  if (req.auth.isOwner) return true;
  const { rows } = await controlDb.execute({
    sql: `SELECT COUNT(DISTINCT rp.permission_key) AS count FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN store_permissions sp
      ON sp.store_id=ur.store_id AND sp.permission_key=rp.permission_key
      WHERE ur.user_id=? AND ur.store_id=? AND rp.permission_key IN (?, ?, ?)`,
    args: [req.auth.userId, req.auth.storeId, ...requiredPermissions],
  });
  return Number(rows[0].count) === requiredPermissions.length;
}

function parseUpload(body) {
  const name = String(body?.fileName ?? '');
  const encoded = String(body?.fileContentBase64 ?? '');
  if (!name || !encoded) throw Object.assign(new Error('Choose an Excel (.xlsx) or CSV file first.'), { status: 400 });
  const ext = name.toLowerCase().split('.').pop();
  if (!['xlsx', 'csv'].includes(ext)) throw Object.assign(new Error('Choose an Excel (.xlsx) or CSV file.'), { status: 400 });
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw Object.assign(new Error('The import file must be under 8 MB.'), { status: 400 });
  let workbook;
  try { workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true, raw: false }); }
  catch { throw Object.assign(new Error('This file could not be opened. Save it as .xlsx or .csv and try again.'), { status: 400 }); }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw Object.assign(new Error('The workbook has no worksheet.'), { status: 400 });
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
  if (matrix.length < 2) throw Object.assign(new Error('The file has no data rows.'), { status: 400 });
  const map = new Map();
  (matrix[0] ?? []).forEach((value, index) => {
    const normalized = key(value).replace(/[^A-Z0-9]/g, '');
    const header = headers.find((item) => key(item).replace(/[^A-Z0-9]/g, '') === normalized);
    if (header) map.set(header, index);
  });
  if (!map.has('MedicineName') && !map.has('SupplierName')) throw Object.assign(new Error('The header row must include MedicineName or SupplierName. Download the template for the full column list.'), { status: 400 });
  const rows = matrix.slice(1).map((cells, offset) => Object.fromEntries(headers.map((header) => [header, String(cells?.[map.get(header)] ?? '').trim()]).concat([['RowNumber', offset + 2]]))).filter((row) => headers.some((header) => row[header]));
  return rows;
}

async function validate(req, rows) {
  if (rows.length > 5000) throw Object.assign(new Error('Import up to 5000 rows at a time.'), { status: 400 });
  if (!rows.length) throw Object.assign(new Error('The file has no data rows.'), { status: 400 });
  const [existingMedicines, existingSuppliers, existingBatches] = await Promise.all([
    req.db.execute('SELECT id, name, generic_name AS GenericName, strength AS Strength, dosage_form AS DosageForm, barcode, minimum_stock AS minimumStock, requires_prescription AS requiresPrescription, is_active AS isActive FROM medicines'),
    req.db.execute('SELECT id, name FROM suppliers'),
    req.db.execute('SELECT id, medicine_id AS medicineId, number, expiry_date AS expiryDate, cost_price AS costPrice, sale_price AS salePrice, quantity FROM batches'),
  ]);
  const medicines = existingMedicines.rows;
  const supplierNames = new Set(existingSuppliers.rows.map((supplier) => key(supplier.name)));
  const fileMedicine = new Set(), fileSupplier = new Set(), fileBarcode = new Map(), fileBatch = new Set();
  const today = new Date().toISOString().slice(0, 10);
  const checked = [];
  for (const source of rows) {
    const errors = [], warnings = [];
    const hasMedicine = Boolean(source.MedicineName), hasSupplier = Boolean(source.SupplierName);
    const mkey = hasMedicine ? medicineKey(source) : '';
    if (!hasMedicine && !hasSupplier) errors.push('Enter a medicine name or supplier name.');
    if (!hasMedicine && source.Barcode) errors.push('A barcode needs a medicine name.');
    if (source.MedicineName.length > 200 || source.GenericName.length > 200 || source.Strength.length > 80 || source.DosageForm.length > 80 || source.Manufacturer.length > 160 || source.Barcode.length > 100) errors.push('Medicine details exceed the allowed field length.');
    const minStock = source.MinimumStock ? Number(source.MinimumStock) : 0;
    if (!Number.isInteger(minStock) || minStock < 0) errors.push('MinimumStock must be a whole number zero or greater.');
    let prescription = false;
    if (source.RequiresPrescription) {
      const val = key(source.RequiresPrescription);
      if (['TRUE','YES','1'].includes(val)) prescription = true;
      else if (!['FALSE','NO','0'].includes(val)) errors.push('RequiresPrescription must be true/false or yes/no.');
    }
    if (hasSupplier && source.SupplierName.length > 200) errors.push('Supplier name cannot exceed 200 characters.');
    if (source.ContactPerson.length > 120 || source.Phone.length > 40 || source.Email.length > 254 || source.Address.length > 300) errors.push('Supplier contact details exceed the allowed field length.');
    if (!hasSupplier && [source.ContactPerson, source.Phone, source.Email, source.Address].some(Boolean)) errors.push('Enter a supplier name for the supplier contact details.');
    const existingMedicine = medicines.find((item) => medicineKey({ MedicineName: item.name, GenericName: item.GenericName, Strength: item.Strength, DosageForm: item.DosageForm }) === mkey);
    if (existingMedicine && !existingMedicine.isActive) errors.push('This matching medicine is inactive. Activate it before importing stock.');
    if (source.Barcode) {
      const match = medicines.find((item) => key(item.barcode) === key(source.Barcode));
      if (match && medicineKey({ MedicineName: match.name, GenericName: match.GenericName, Strength: match.Strength, DosageForm: match.DosageForm }) !== mkey) errors.push('This barcode already belongs to a different medicine.');
      const previous = fileBarcode.get(key(source.Barcode));
      if (previous && previous !== mkey) errors.push('This barcode is assigned to more than one medicine in the file.');
      fileBarcode.set(key(source.Barcode), mkey);
    }
    if (hasMedicine && !fileMedicine.add(mkey)) warnings.push('This medicine appears on another row; one catalogue record will be created for it.');
    if (existingMedicine) warnings.push('Matching medicine already exists; its catalogue record will be reused.');
    const supplierKey = key(source.SupplierName);
    if (hasSupplier && supplierNames.has(supplierKey)) warnings.push('Matching supplier already exists; its contact record will be reused.');
    else if (hasSupplier && !fileSupplier.add(supplierKey)) warnings.push('This supplier appears on another row; one supplier record will be created for it.');
    const quantity = source.OpeningQuantity ? Number(source.OpeningQuantity) : 0;
    if (!Number.isInteger(quantity) || quantity < 0) errors.push('OpeningQuantity must be a whole number zero or greater.');
    let expiryDate = '', costPrice = 0, salePrice = 0;
    if (quantity > 0) {
      if (!hasMedicine) errors.push('Enter a medicine name for opening stock.');
      if (!source.BatchNumber) errors.push('BatchNumber is required when OpeningQuantity is above zero.');
      else if (source.BatchNumber.length > 100) errors.push('BatchNumber cannot exceed 100 characters.');
      const parsedDate = source.ExpiryDate ? new Date(source.ExpiryDate) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) errors.push('ExpiryDate must be a valid date (Excel dates and YYYY-MM-DD are accepted).');
      else {
        expiryDate = parsedDate.toISOString().slice(0, 10);
        if (expiryDate <= today) errors.push('Opening stock expiry must be a future date.');
      }
      costPrice = source.UnitCost ? Number(source.UnitCost) : Number.NaN;
      salePrice = source.SalePrice ? Number(source.SalePrice) : Number.NaN;
      if (!Number.isFinite(costPrice) || costPrice < 0) errors.push('UnitCost must be zero or greater.');
      if (!Number.isFinite(salePrice) || salePrice < 0) errors.push('SalePrice must be zero or greater.');
      if (expiryDate && hasMedicine && source.BatchNumber.length <= 100) {
        const batchKey = `${mkey}\u001f${key(source.BatchNumber)}\u001f${expiryDate}`;
        if (!fileBatch.add(batchKey)) errors.push('This medicine, batch number and expiry date are repeated in the file.');
        const existingBatch = existingMedicine && existingBatches.rows.find((item) => Number(item.medicineId) === Number(existingMedicine.id) && key(item.number) === key(source.BatchNumber) && item.expiryDate === expiryDate);
        if (existingBatch && (Number(existingBatch.costPrice) !== costPrice || Number(existingBatch.salePrice) !== salePrice)) errors.push('An existing batch has different prices. Correct the file before adding its stock.');
        else if (existingBatch) warnings.push('Stock will be added to the matching existing batch.');
      }
    } else if (source.BatchNumber || source.ExpiryDate || source.UnitCost || source.SalePrice) warnings.push('Batch details are ignored because OpeningQuantity is zero or blank.');
    checked.push({ source, mkey, minStock, prescription, quantity, expiryDate, costPrice, salePrice, errors, warnings });
  }
  return checked;
}

function summary(rows) {
  return { rowCount: rows.length, readyCount: rows.filter((row) => !row.errors.length).length,
    errorCount: rows.filter((row) => row.errors.length).length,
    rows: rows.map((row) => ({ rowNumber: row.source.RowNumber, medicineName: row.source.MedicineName, supplierName: row.source.SupplierName, openingQuantity: row.quantity, errors: row.errors, warnings: row.warnings })) };
}

async function requireImportPermission(req, res, next) {
  if (await canImport(req)) return next();
  res.status(403).json({ message: 'Import requires medicine, supplier and inventory management permissions.' });
}

router.get('/template', requireImportPermission, (_req, res) => res.type('text/csv; charset=utf-8').attachment('medical-store-import-template.csv').send(`\uFEFF${template}`));
router.post('/preview', requireImportPermission, async (req, res) => res.json(summary(await validate(req, parseUpload(req.body)))));
router.post('/commit', requireImportPermission, async (req, res) => {
  const checked = await validate(req, parseUpload(req.body));
  if (checked.some((row) => row.errors.length)) return res.status(409).json(summary(checked));
  const tx = await req.db.transaction('write');
  try {
    const { rows: medicineRows } = await tx.execute('SELECT id, name, generic_name AS GenericName, strength AS Strength, dosage_form AS DosageForm FROM medicines');
    const medicines = new Map(medicineRows.map((item) => [medicineKey({ MedicineName: item.name, GenericName: item.GenericName, Strength: item.Strength, DosageForm: item.DosageForm }), Number(item.id)]));
    const { rows: supplierRows } = await tx.execute('SELECT id, name FROM suppliers');
    const suppliers = new Map(supplierRows.map((item) => [key(item.name), Number(item.id)]));
    let createdMedicines = 0, createdSuppliers = 0, unitsAdded = 0;
    for (const row of checked) {
      if (row.source.MedicineName && !medicines.has(row.mkey)) {
        const { rows } = await tx.execute({ sql: `INSERT INTO medicines(name, generic_name, strength, dosage_form, manufacturer, barcode, minimum_stock, requires_prescription) VALUES(?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, args: [row.source.MedicineName.trim(), clean(row.source.GenericName), clean(row.source.Strength), clean(row.source.DosageForm), clean(row.source.Manufacturer), clean(row.source.Barcode), row.minStock, row.prescription ? 1 : 0] });
        medicines.set(row.mkey, Number(rows[0].id)); createdMedicines++;
      }
      const supplierKey = key(row.source.SupplierName);
      if (row.source.SupplierName && !suppliers.has(supplierKey)) {
        const { rows } = await tx.execute({ sql: 'INSERT INTO suppliers(name, phone, contact_person, email, address) VALUES(?, ?, ?, ?, ?) RETURNING id', args: [row.source.SupplierName.trim(), clean(row.source.Phone), clean(row.source.ContactPerson), clean(row.source.Email), clean(row.source.Address)] });
        suppliers.set(supplierKey, Number(rows[0].id)); createdSuppliers++;
      }
    }
    const batchLookup = new Map();
    const { rows: allBatches } = await tx.execute('SELECT id, medicine_id AS medicineId, number, expiry_date AS expiryDate, cost_price AS costPrice, sale_price AS salePrice, quantity FROM batches');
    for (const row of checked.filter((item) => item.quantity > 0)) {
      const medicineId = medicines.get(row.mkey);
      const bkey = `${medicineId}\u001f${key(row.source.BatchNumber)}\u001f${row.expiryDate}`;
      let batch = batchLookup.get(bkey) ?? allBatches.find((item) => Number(item.medicineId) === medicineId && key(item.number) === key(row.source.BatchNumber) && item.expiryDate === row.expiryDate);
      if (!batch) {
        const { rows } = await tx.execute({ sql: 'INSERT INTO batches(medicine_id, number, expiry_date, cost_price, sale_price, quantity) VALUES(?, ?, ?, ?, ?, ?) RETURNING id, quantity', args: [medicineId, row.source.BatchNumber.trim(), row.expiryDate, row.costPrice, row.salePrice, row.quantity] });
        batch = { id: Number(rows[0].id), quantity: row.quantity, medicineId, number: row.source.BatchNumber, expiryDate: row.expiryDate, costPrice: row.costPrice, salePrice: row.salePrice };
        allBatches.push(batch);
      } else {
        const { rows } = await tx.execute({ sql: 'UPDATE batches SET quantity=quantity+?, version=version+1 WHERE id=? RETURNING quantity', args: [row.quantity, batch.id] });
        batch = { ...batch, quantity: Number(rows[0].quantity) };
      }
      batchLookup.set(bkey, batch);
      unitsAdded += row.quantity;
      await tx.execute({ sql: `INSERT INTO stock_movements(batch_id, type, quantity_change, balance_after, reason, actor_id) VALUES(?, 'OpeningStock', ?, ?, ?, ?)`, args: [batch.id, row.quantity, batch.quantity, `Opening stock import, spreadsheet row ${row.source.RowNumber}`, req.auth.userId] });
    }
    await tx.commit();
    res.json({ createdMedicines, createdSuppliers, openingBatches: checked.filter((row) => row.quantity > 0).length, unitsAdded });
  } catch (error) { await tx.rollback(); throw error; }
});

export default router;
