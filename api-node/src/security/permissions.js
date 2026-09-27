export const permissions = {
  'users.manage': 'Manage users and roles',
  'roles.manage': 'Create roles and change permissions',
  'medicines.read': 'View medicines',
  'medicines.manage': 'Create, edit and deactivate medicines',
  'inventory.read': 'View inventory',
  'inventory.manage': 'Adjust inventory',
  'purchases.read': 'View purchases',
  'purchases.create': 'Create purchases from Inventory',
  'purchases.manage': 'Receive purchases, process returns and supplier payments',
  'sales.read': 'View sales and receipts',
  'sales.create': 'Create sales at POS',
  'sales.manage': 'Process sales returns and discounts',
  'suppliers.read': 'View suppliers',
  'suppliers.manage': 'Add and manage suppliers',
  'customers.read': 'View customers and balances',
  'customers.manage': 'Manage customers and record payments',
  'expenses.read': 'View expenses',
  'expenses.manage': 'Manage expense categories and entries',
  'reports.read': 'View reports and dashboard',
};

export const defaultRoles = {
  Administrator: Object.keys(permissions),
  Pharmacist: ['medicines.read', 'inventory.read', 'purchases.read', 'sales.read', 'sales.create', 'sales.manage', 'suppliers.read', 'reports.read'],
  Cashier: ['medicines.read', 'inventory.read', 'sales.read', 'sales.create'],
  'Inventory Manager': ['medicines.read', 'medicines.manage', 'inventory.read', 'inventory.manage', 'purchases.read', 'purchases.create', 'purchases.manage', 'sales.read', 'suppliers.read', 'reports.read'],
};

export async function userHasPermission(controlDb, userId, storeId, permission) {
  if (!permissions[permission]) return false;
  const { rows } = await controlDb.execute({
    sql: `SELECT 1 AS allowed FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN store_permissions sp ON sp.store_id = ur.store_id AND sp.permission_key = rp.permission_key
      WHERE ur.user_id = ? AND ur.store_id = ? AND rp.permission_key = ? LIMIT 1`,
    args: [userId, storeId, permission],
  });
  return rows.length > 0;
}
