import { expect, Page, test } from '@playwright/test';

// UI contract fixtures only. These tests do not replace API/SQL integration tests.
async function mockApi(page: Page) {
  const state = {
    medicines: [{ id: 1, name: 'Paracetamol 500mg', genericName: 'Paracetamol', barcode: '12345', stock: 20, minimumStock: 10, requiresPrescription: false, isActive: true }],
    suppliers: [{ id: 1, name: 'Demo Pharma', phone: '0000000000' }],
    batches: [{ id: 1, medicineId: 1, medicine: 'Paracetamol 500mg', number: 'LOT-01', expiryDate: '2050-12-31', costPrice: 2, salePrice: 5, quantity: 20 }],
    sales: [] as { id: number; invoiceNumber: string; createdAt: string; total: number }[],
    receipts: {} as Record<number, unknown>,
    users: [{ id: 'owner', email: 'owner@example.com', roles: ['Administrator'], isActive: true }],
    permissionOptions: [
      ['users.manage', 'Manage users and roles'], ['roles.manage', 'Create roles and change permissions'], ['medicines.read', 'View medicines'],
      ['medicines.manage', 'Create medicines'], ['inventory.read', 'View inventory'],
      ['inventory.manage', 'Adjust inventory'], ['purchases.read', 'View purchases'],
      ['purchases.manage', 'Receive purchases'], ['sales.read', 'View sales and receipts'],
      ['sales.create', 'Create sales at POS'], ['suppliers.read', 'View suppliers'],
      ['suppliers.manage', 'Manage suppliers'], ['reports.read', 'View reports and dashboard'],
    ] as [string, string][],
    roles: [] as { id: string; name: string; permissions: string[]; availablePermissions: { key: string; label: string }[]; canAssign: boolean }[],
    failReceipt: false,
    unauthorizedInventory: false,
    salePosts: 0,
  };
  const allPermissionKeys = state.permissionOptions.map(([key]) => key);
  state.roles.push(
    { id: 'admin', name: 'Administrator', permissions: allPermissionKeys, availablePermissions: state.permissionOptions.map(([key, label]) => ({ key, label })), canAssign: true },
    { id: 'pharmacist', name: 'Pharmacist', permissions: ['medicines.read', 'inventory.read', 'purchases.read', 'sales.read', 'sales.create', 'suppliers.read', 'reports.read'], availablePermissions: state.permissionOptions.map(([key, label]) => ({ key, label })), canAssign: true },
    { id: 'cashier', name: 'Cashier', permissions: ['medicines.read', 'inventory.read', 'sales.read', 'sales.create'], availablePermissions: state.permissionOptions.map(([key, label]) => ({ key, label })), canAssign: true },
    { id: 'inventory-manager', name: 'Inventory Manager', permissions: ['medicines.read', 'medicines.manage', 'inventory.read', 'inventory.manage', 'purchases.read', 'purchases.manage', 'sales.read', 'suppliers.read', 'reports.read'], availablePermissions: state.permissionOptions.map(([key, label]) => ({ key, label })), canAssign: true },
  );
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (path === '/api/auth/login') {
      const body = request.postDataJSON();
      if (body.password === 'wrong') return reply({}, 401);
      const isCashier = body.email === 'cashier@example.com';
      return reply({ token: 'test-token', email: body.email, roles: [isCashier ? 'Cashier' : 'Administrator'],
        permissions: isCashier ? ['medicines.read', 'inventory.read', 'sales.read', 'sales.create'] : allPermissionKeys });
    }
    if (request.headers()['authorization'] !== 'Bearer test-token') return reply({}, 401);
    if (path === '/api/auth/users' && method === 'GET') return reply(state.users);
    if (path === '/api/auth/users' && method === 'POST') {
      const body = request.postDataJSON();
      const user = { id: `user-${state.users.length}`, email: body.email, roles: body.roles, isActive: true };
      state.users.push(user); return reply(user, 201);
    }
    const userRoles = path.match(/^\/api\/auth\/users\/([^/]+)\/roles$/);
    if (userRoles && method === 'PUT') {
      const user = state.users.find(x => x.id === userRoles[1])!;
      user.roles = request.postDataJSON().roles; return reply(user);
    }
    const userStatus = path.match(/^\/api\/auth\/users\/([^/]+)\/status$/);
    if (userStatus && method === 'PUT') {
      const user = state.users.find(x => x.id === userStatus[1])!;
      user.isActive = request.postDataJSON().isActive; return reply(user);
    }
    if (path === '/api/auth/roles' && method === 'GET') return reply(state.roles);
    if (path === '/api/auth/roles' && method === 'POST') {
      const body = request.postDataJSON();
      const role = { id: `role-${state.roles.length}`, name: body.name, permissions: [], availablePermissions: state.roles[0].availablePermissions, canAssign: true };
      state.roles.push(role); return reply(role, 201);
    }
    const rolePermissions = path.match(/^\/api\/auth\/roles\/([^/]+)\/permissions$/);
    if (rolePermissions && method === 'PUT') {
      const role = state.roles.find(x => x.id === rolePermissions[1])!;
      role.permissions = request.postDataJSON().permissions; return reply(role);
    }
    if (path === '/api/medicines' && method === 'GET') return reply(state.medicines);
    if (path === '/api/medicines' && method === 'POST') {
      const body = request.postDataJSON();
      if (state.medicines.some(m => body.barcode && m.barcode === body.barcode)) return reply('Barcode already exists.', 409);
      const medicine = { ...body, id: state.medicines.length + 1, stock: 0, isActive: true };
      state.medicines.push(medicine); return reply({ id: medicine.id }, 201);
    }
    if (path === '/api/suppliers' && method === 'GET') return reply(state.suppliers);
    if (path === '/api/suppliers' && method === 'POST') {
      const supplier = { ...request.postDataJSON(), id: state.suppliers.length + 1 };
      state.suppliers.push(supplier); return reply({ id: supplier.id }, 201);
    }
    if (path === '/api/inventory') return reply(state.unauthorizedInventory ? {} : state.batches, state.unauthorizedInventory ? 401 : 200);
    if (path === '/api/purchases' && method === 'POST') {
      const body = request.postDataJSON();
      expect(body.supplierInvoice).toBeTruthy(); expect(body.supplierId).toBe(2);
      for (const line of body.lines) {
        const medicine = state.medicines.find(m => m.id === line.medicineId)!;
        medicine.stock += line.quantity;
        state.batches.push({ id: state.batches.length + 1, medicineId: medicine.id, medicine: medicine.name, number: line.batchNumber,
          expiryDate: line.expiryDate, costPrice: line.costPrice, salePrice: line.salePrice, quantity: line.quantity });
      }
      return reply({ id: 1, total: 30 }, 201);
    }
    if (path === '/api/dashboard') return reply({ todaySales: state.sales.reduce((s, x) => s + x.total, 0), todayInvoices: state.sales.length, medicineCount: state.medicines.length, expiringBatches: 0, expiredBatches: 0 });
    if (path === '/api/sales' && method === 'GET') return reply(state.sales);
    if (path === '/api/sales' && method === 'POST') {
      state.salePosts++;
      const body = request.postDataJSON();
      const id = state.sales.length + 1;
      const lines = body.lines.map((line: { medicineId: number; quantity: number }) => {
        const medicine = state.medicines.find(m => m.id === line.medicineId)!;
        expect(line.quantity).toBeGreaterThan(0);
        medicine.stock -= line.quantity; state.batches[0].quantity -= line.quantity;
        return { medicine: medicine.name, batch: 'LOT-01', quantity: line.quantity, unitPrice: 5, total: line.quantity * 5 };
      });
      const total = lines.reduce((sum: number, line: { total: number }) => sum + line.total, 0);
      const sale = { id, invoiceNumber: `INV-${String(id).padStart(8, '0')}`, createdAt: new Date().toISOString(), total };
      state.sales.push(sale); state.receipts[id] = { ...sale, cashReceived: body.cashReceived, lines };
      return reply({ ...sale, change: body.cashReceived - total }, 201);
    }
    if (/^\/api\/sales\/\d+$/.test(path)) {
      if (state.failReceipt) return reply('Receipt unavailable', 500);
      return reply(state.receipts[Number(path.split('/').pop())]);
    }
    return reply(`Unexpected API request: ${method} ${path}`, 501);
  });
  return state;
}

async function submitLogin(page: Page) {
  await page.getByLabel('Email', { exact: true }).fill('owner@example.com');
  await page.getByLabel('Password', { exact: true }).fill('ExamplePassword123!');
  await page.getByRole('button', { name: /Sign in/ }).click();
}
async function signIn(page: Page, path = '/reports') {
  await page.goto(path);
  await expect(page).toHaveURL(/\/login/);
  await submitLogin(page);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}
async function navigate(page: Page, name: RegExp) {
  const link = page.getByRole('navigation').getByRole('link', { name });
  const href = await link.getAttribute('href');
  const pageTitleByPath: Record<string, string> = {
    '/reports': 'Overview',
    '/sales/pos': 'New sale',
    '/medicines': 'Medicines',
    '/purchases': 'Receive purchase',
    '/inventory': 'Inventory',
    '/suppliers': 'Suppliers',
    '/sales': 'Sales history',
    '/users': 'Users & roles',
  };
  await link.click();
  if (href && pageTitleByPath[href]) {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pageTitleByPath[href]);
  }
}

test('protected deep links, session restore and 401 redirect', async ({ page }) => {
  const state = await mockApi(page);
  await signIn(page, '/inventory');
  await expect(page.getByRole('cell', { name: 'Available', exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole('cell', { name: 'Available', exact: true })).toBeVisible();
  state.unauthorizedInventory = true;
  await navigate(page, /Dashboard/); await navigate(page, /Inventory/);
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => sessionStorage.getItem('medical-token'))).toBeNull();
});

test('medicine, supplier and purchase pages keep their own forms and update inventory', async ({ page }) => {
  await mockApi(page); await signIn(page);
  await navigate(page, /Medicines/);
  await page.getByLabel('Medicine name').fill('Vitamin C');
  await page.getByLabel('Barcode', { exact: true }).fill('67890');
  await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Vitamin C' })).toBeVisible();
  await navigate(page, /Suppliers/);
  await page.getByLabel('Supplier name').fill('City Pharma');
  await page.getByRole('button', { name: 'Add supplier', exact: true }).click();
  await expect(page.getByText('City Pharma', { exact: true })).toBeVisible();
  await navigate(page, /Purchases/);
  await page.getByRole('combobox', { name: 'Supplier', exact: true }).selectOption({ label: 'City Pharma' });
  await page.getByLabel('Supplier invoice').fill('SUP-002');
  await page.getByRole('combobox', { name: 'Medicine', exact: true }).selectOption({ label: 'Vitamin C' });
  await page.getByLabel('Batch number').fill('VC-02');
  await page.getByLabel('Expiry date').fill('2050-12-31');
  await page.getByLabel('Quantity (units)').fill('10');
  await page.getByLabel('Unit cost (Rs)').fill('3');
  await page.getByLabel('Sale price (Rs)').fill('5');
  await page.getByRole('button', { name: /Receive batch/ }).click();
  await expect(page.getByText('Purchase received; batch stock updated.')).toBeVisible();
  await navigate(page, /Inventory/);
  await expect(page.getByRole('row').filter({ hasText: 'VC-02' })).toContainText('10');
});

test('POS survives navigation, posts once, prints receipt and clears on logout', async ({ page }) => {
  const state = await mockApi(page); await signIn(page, '/sales/pos');
  await page.getByRole('button', { name: /Paracetamol 500mg/ }).click();
  await navigate(page, /Suppliers/); await navigate(page, /New sale/);
  await expect(page.locator('.cart-row')).toHaveCount(1);
  await page.getByLabel('Cash received (Rs)').fill('20');
  await page.getByRole('button', { name: /Complete sale/ }).click();
  await expect(page.locator('.receipt-paper')).toContainText('INV-00000001');
  await expect(page.getByText('Your cart is empty')).toBeVisible();
  expect(state.salePosts).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.receipt-paper')).toBeVisible();
  await expect(page.locator('.page-content')).toBeHidden();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await navigate(page, /Sales history/);
  await page.getByRole('button', { name: /View receipt/ }).click();
  await expect(page.locator('.receipt-paper')).toContainText('INV-00000001');
  await navigate(page, /New sale/);
  await page.getByRole('button', { name: /Paracetamol 500mg/ }).click();
  await page.getByTitle('Sign out').click();
  await expect(page).toHaveURL(/\/login$/);
  await submitLogin(page); await expect(page).toHaveURL(/\/reports$/);
  await navigate(page, /New sale/);
  await expect(page.getByText('Your cart is empty')).toBeVisible();
});

test('receipt fetch failure does not allow a completed cart to be resubmitted', async ({ page }) => {
  const state = await mockApi(page); state.failReceipt = true;
  await signIn(page, '/sales/pos');
  await page.getByRole('button', { name: /Paracetamol 500mg/ }).click();
  await page.getByLabel('Cash received (Rs)').fill('10');
  await page.getByRole('button', { name: /Complete sale/ }).click();
  await expect(page.getByText(/Sale INV-00000001 was saved/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Complete sale/ })).toBeDisabled();
  expect(state.salePosts).toBe(1);
  state.failReceipt = false;
  await navigate(page, /Sales history/);
  await page.getByRole('button', { name: /View receipt/ }).click();
  await expect(page.locator('.receipt-paper')).toContainText('INV-00000001');
});

test('invalid login and API validation errors are displayed on the owning page', async ({ page }) => {
  await mockApi(page); await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('owner@example.com');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  await submitLogin(page); await expect(page).toHaveURL(/\/reports$/);
  await navigate(page, /Medicines/);
  await page.getByLabel('Medicine name').fill('Duplicate medicine');
  await page.getByLabel('Barcode', { exact: true }).fill('12345');
  await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
  await expect(page.getByText('Barcode already exists.')).toBeVisible();
  await expect(page.getByLabel('Medicine name')).toHaveValue('Duplicate medicine');
});

test('admins can create users, configure roles and deactivate access', async ({ page }) => {
  const state = await mockApi(page); await signIn(page);
  await navigate(page, /Users & roles/);
  await page.getByLabel('Email', { exact: true }).fill('cashier@example.com');
  await page.getByLabel('Initial password').fill('ValidStrongPassword123!');
  await page.getByLabel('Cashier', { exact: true }).check();
  await page.getByRole('button', { name: 'Create user' }).click();
  const userRow = page.getByRole('row').filter({ hasText: 'cashier@example.com' });
  await expect(userRow).toContainText('Cashier');
  await userRow.getByRole('combobox', { name: 'Roles for cashier@example.com' }).selectOption(['Pharmacist']);
  await userRow.getByRole('button', { name: 'Save roles' }).click();
  await expect(userRow).toContainText('Pharmacist');
  await userRow.getByRole('button', { name: 'Deactivate' }).click();
  await expect(userRow).toContainText('Inactive');

  await page.getByLabel('New role name').fill('Store Supervisor');
  await page.getByRole('button', { name: 'Add role' }).click();
  const supervisor = page.locator('.role-card').filter({ has: page.getByRole('heading', { name: 'Store Supervisor' }) });
  await supervisor.getByLabel('View reports and dashboard').check();
  await supervisor.getByRole('button', { name: 'Save permissions' }).click();
  expect(state.roles.find(role => role.name === 'Store Supervisor')?.permissions).toContain('reports.read');
  expect(state.users.find(user => user.email === 'cashier@example.com')?.isActive).toBe(false);
});

test('cashier permissions limit navigation and hide medicine management', async ({ page }) => {
  await mockApi(page); await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('cashier@example.com');
  await page.getByLabel('Password', { exact: true }).fill('ExamplePassword123!');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole('navigation').getByRole('link', { name: /Users & roles/ })).toHaveCount(0);
  await navigate(page, /Medicines/);
  await expect(page.getByRole('button', { name: 'Add medicine', exact: true })).toHaveCount(0);
  await navigate(page, /New sale/);
  await expect(page.getByRole('button', { name: /Complete sale/ })).toBeVisible();
  await page.goto('/purchases');
  await expect(page).toHaveURL(/\/forbidden$/);
});

test('desktop dashboard and mobile POS remain usable after component styling split', async ({ page }, testInfo) => {
  await mockApi(page); await signIn(page);
  await expect(page.getByText('Every detail, in its place.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, /New sale/);
  await expect(page.getByRole('button', { name: /Paracetamol 500mg/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Complete sale/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
  await page.screenshot({ path: testInfo.outputPath('mobile-pos.png'), fullPage: true });
});
