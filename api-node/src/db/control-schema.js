export const controlSchema = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1, subscription_plan TEXT NOT NULL DEFAULT 'Trial',
    subscription_status TEXT NOT NULL DEFAULT 'Trial', trial_ends_at TEXT,
    subscription_expires_at TEXT, database_name TEXT NOT NULL UNIQUE,
    database_url TEXT NOT NULL, database_token_ciphertext TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1,
    failed_login_count INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
    security_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS user_stores (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, store_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_user_stores_default ON user_stores(user_id) WHERE is_default = 1`,
  `CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL COLLATE NOCASE, is_system INTEGER NOT NULL DEFAULT 0,
    UNIQUE(store_id, name), UNIQUE(id, store_id)
  )`,
  `CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL, PRIMARY KEY(role_id, permission_key)
  )`,
  `CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL, PRIMARY KEY(user_id, store_id, role_id),
    FOREIGN KEY(role_id, store_id) REFERENCES roles(id, store_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS store_permissions (
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL, PRIMARY KEY(store_id, permission_key)
  )`,
];

export const tenantSchema = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS medicines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, generic_name TEXT, barcode TEXT,
    strength TEXT, dosage_form TEXT, manufacturer TEXT, description TEXT,
    requires_prescription INTEGER NOT NULL DEFAULT 0, minimum_stock INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_medicines_barcode ON medicines(barcode) WHERE barcode IS NOT NULL AND trim(barcode) <> ''`,
  `CREATE INDEX IF NOT EXISTS ix_medicines_name ON medicines(name COLLATE NOCASE)`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, contact_person TEXT,
    email TEXT, address TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS ix_suppliers_name ON suppliers(name COLLATE NOCASE)`,
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, email TEXT,
    is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS ix_customers_name ON customers(name COLLATE NOCASE)`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    supplier_invoice TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, total REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, medicine_id INTEGER NOT NULL REFERENCES medicines(id),
    number TEXT NOT NULL, expiry_date TEXT NOT NULL, cost_price REAL NOT NULL, sale_price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS ix_batches_medicine_expiry ON batches(medicine_id, expiry_date, id)`,
  `CREATE TABLE IF NOT EXISTS purchase_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    batch_id INTEGER NOT NULL REFERENCES batches(id), quantity INTEGER NOT NULL, unit_cost REAL NOT NULL,
    returned_quantity INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER NOT NULL REFERENCES purchases(id),
    amount REAL NOT NULL, method TEXT NOT NULL DEFAULT 'Cash', reference TEXT,
    paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER NOT NULL REFERENCES purchases(id),
    supplier_reference TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_return_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    purchase_line_id INTEGER NOT NULL REFERENCES purchase_lines(id), batch_id INTEGER NOT NULL REFERENCES batches(id),
    quantity INTEGER NOT NULL, unit_cost REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER NOT NULL REFERENCES purchases(id),
    reason TEXT NOT NULL, actor_id TEXT, previous_total REAL, corrected_total REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_correction_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, correction_id INTEGER NOT NULL REFERENCES purchase_corrections(id) ON DELETE CASCADE,
    purchase_line_id INTEGER NOT NULL REFERENCES purchase_lines(id), quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL, difference INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, total REAL NOT NULL,
    subtotal REAL NOT NULL, discount_amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'Cash', customer_id INTEGER REFERENCES customers(id),
    cash_received REAL NOT NULL DEFAULT 0, cashier_id TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sale_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    batch_id INTEGER NOT NULL REFERENCES batches(id), quantity INTEGER NOT NULL, unit_price REAL NOT NULL,
    unit_cost REAL NOT NULL, discount_amount REAL NOT NULL DEFAULT 0, returned_quantity INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS customer_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id),
    sale_id INTEGER NOT NULL REFERENCES sales(id), amount REAL NOT NULL, method TEXT NOT NULL,
    reference TEXT, paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sale_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL REFERENCES sales(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reason TEXT NOT NULL DEFAULT '',
    refund_method TEXT NOT NULL DEFAULT 'Cash', total_refund REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sale_return_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sale_return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    sale_line_id INTEGER NOT NULL REFERENCES sale_lines(id), batch_id INTEGER NOT NULL REFERENCES batches(id),
    quantity INTEGER NOT NULL, restocked INTEGER NOT NULL, unit_refund REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL REFERENCES batches(id),
    type TEXT NOT NULL, reference_id INTEGER NOT NULL DEFAULT 0, quantity_change INTEGER NOT NULL,
    balance_after INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', actor_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS ix_stock_movements_batch ON stock_movements(batch_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, is_active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    description TEXT NOT NULL, amount REAL NOT NULL, expense_date TEXT NOT NULL,
    payment_method TEXT NOT NULL, reference TEXT, notes TEXT, actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];
