import { expect, Page, test } from '@playwright/test';

// UI contract fixtures only. These tests do not replace API/SQL integration tests.
async function mockApi(page: Page) {
  const state = {
    medicines: [{ id: 1, name: 'Paracetamol 500mg', genericName: 'Paracetamol', barcode: '12345', stock: 20, minimumStock: 10, requiresPrescription: false, isActive: true }],
    suppliers: [{ id: 1, name: 'Demo Pharma', phone: '0000000000', contactPerson: '', email: '', address: '', isActive: true }],
    customers: [] as { id: number; name: string; phone?: string; email?: string; isActive: boolean }[],
    expenseCategories: [] as { id: number; name: string; isActive: boolean }[],
    expenses: [] as { id: number; categoryId: number; category: string; description: string; amount: number; expenseDate: string; paymentMethod: string; reference?: string; notes?: string }[],
    batches: [{ id: 1, medicineId: 1, medicine: 'Paracetamol 500mg', number: 'LOT-01', expiryDate: '2050-12-31', costPrice: 2, salePrice: 5, quantity: 20 }],
    sales: [] as { id: number; invoiceNumber: string; createdAt: string; subtotal: number; discountAmount: number; total: number; paymentMethod: string; returnedTotal: number; customerId?: number | null; paidTotal?: number }[],
    receipts: {} as Record<number, unknown>,
    purchases: [] as { id: number; supplier: string; supplierInvoice: string; createdAt: string; total: number; returnedTotal: number; paidTotal: number; lines: { id: number; medicine: string; batch: string; quantity: number; returnedQuantity: number; unitCost: number; onHand: number }[]; returns: { id: number; supplierReference: string; reason: string; createdAt: string; total: number }[]; payments: { id: number; amount: number; method: string; reference: string; paidAt: string }[] }[],
    movements: [] as { id: number; batchId: number; medicine: string; batch: string; type: string; quantityChange: number; balanceAfter: number; reason: string; createdAt: string }[],
    users: [
      { id: 'owner', email: 'owner@example.com', roles: ['Administrator'], isActive: true, storeIds: [1] },
      { id: 'store-admin', email: 'storeadmin@example.com', roles: ['Administrator'], isActive: true, storeIds: [1] },
    ],
    stores: [
      { id: 1, name: 'Main Store', code: 'MAIN', isDefault: true, isActive: true, subscriptionPlan: 'Legacy', subscriptionStatus: 'Active', permissions: [] as string[] },
      { id: 2, name: 'West Branch', code: 'WEST', isDefault: false, isActive: true, subscriptionPlan: 'Legacy', subscriptionStatus: 'Active', permissions: [] as string[] },
    ],
    permissionOptions: [
      ['users.manage', 'Manage users and roles'], ['roles.manage', 'Create roles and change permissions'], ['medicines.read', 'View medicines'],
      ['medicines.manage', 'Create medicines'], ['inventory.read', 'View inventory'],
      ['inventory.manage', 'Adjust inventory'], ['purchases.read', 'View purchases'],
      ['purchases.manage', 'Receive purchases'], ['sales.read', 'View sales and receipts'],
      ['sales.create', 'Create sales at POS'], ['sales.manage', 'Process sales returns and discounts'], ['suppliers.read', 'View suppliers'],
      ['suppliers.manage', 'Manage suppliers'], ['customers.read', 'View customers and balances'], ['customers.manage', 'Manage customers and record payments'],
      ['expenses.read', 'View expenses'], ['expenses.manage', 'Manage expense categories and entries'], ['reports.read', 'View reports and dashboard'],
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
  state.stores.forEach(store => store.permissions = allPermissionKeys);
  let isApplicationOwner = false;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (path === '/api/auth/login') {
      const body = request.postDataJSON();
      if (body.password === 'wrong') return reply({}, 401);
      const isCashier = body.email === 'cashier@example.com';
      const isStoreAdmin = body.email === 'storeadmin@example.com';
      isApplicationOwner = body.email === 'owner@example.com';
      return reply({ token: 'test-token', userId: isCashier ? 'cashier' : (isStoreAdmin ? 'store-admin' : 'owner'), email: body.email, activeStoreId: 1, stores: state.stores, roles: [isCashier ? 'Cashier' : 'Administrator'],
        isApplicationOwner, permissions: isCashier ? ['medicines.read', 'inventory.read', 'sales.read', 'sales.create'] : allPermissionKeys });
    }
    if (request.headers()['authorization'] !== 'Bearer test-token') return reply({}, 401);
    if (!isApplicationOwner && ((path.startsWith('/api/stores/') && path !== '/api/stores') ||
      (path === '/api/stores' && method === 'POST') ||
      (path === '/api/auth/users' && (method === 'GET' || method === 'POST')) ||
      path.startsWith('/api/auth/roles') || /^\/api\/auth\/users\/[^/]+\/(?:password|roles|status|stores)$/.test(path))) return reply({}, 403);
    if (path === '/api/auth/switch-store' && method === 'POST') {
      const activeStoreId = request.postDataJSON().storeId;
      state.stores.forEach(store => store.isDefault = store.id === activeStoreId);
      return reply({ token: 'test-token', userId: isApplicationOwner ? 'owner' : 'store-admin', email: isApplicationOwner ? 'owner@example.com' : 'storeadmin@example.com', activeStoreId,
        stores: state.stores, roles: ['Administrator'], permissions: allPermissionKeys, isApplicationOwner });
    }
    if (path === '/api/auth/users' && method === 'GET') return reply(state.users);
    if (path === '/api/auth/users' && method === 'POST') {
      const body = request.postDataJSON();
      const user = { id: `user-${state.users.length}`, email: body.email, roles: body.roles, isActive: true, storeIds: body.storeIds };
      state.users.push(user); return reply(user, 201);
    }
    const userPassword = path.match(/^\/api\/auth\/users\/([^/]+)\/password$/);
    if (userPassword && method === 'PUT') return reply({ userId: userPassword[1], message: 'Password reset.' });
    if (path === '/api/stores' && method === 'GET') return reply(state.stores);
    if (path === '/api/stores/all' && method === 'GET') return reply(state.stores);
    const storeStatus = path.match(/^\/api\/stores\/(\d+)\/status$/);
    if (storeStatus && method === 'PUT') {
      const store = state.stores.find(x => x.id === Number(storeStatus[1]))!;
      store.isActive = request.postDataJSON().isActive; return reply(store);
    }
    const storeSubscription = path.match(/^\/api\/stores\/(\d+)\/subscription$/);
    if (storeSubscription && method === 'PUT') {
      const store = state.stores.find(x => x.id === Number(storeSubscription[1]))!;
      Object.assign(store, { subscriptionPlan: request.postDataJSON().planName, subscriptionStatus: request.postDataJSON().status,
        trialEndsAt: request.postDataJSON().trialEndsAt, subscriptionExpiresAt: request.postDataJSON().subscriptionExpiresAt });
      return reply(store);
    }
    const storePermissions = path.match(/^\/api\/stores\/(\d+)\/permissions$/);
    if (storePermissions && method === 'PUT') {
      const store = state.stores.find(x => x.id === Number(storePermissions[1]))!;
      store.permissions = request.postDataJSON().permissions; return reply({ storeId: store.id, permissions: store.permissions });
    }
    if (path === '/api/stores' && method === 'POST') {
      const body = request.postDataJSON();
      const store = { id: state.stores.length + 1, name: body.name, code: body.code.toUpperCase(), isDefault: false, isActive: true, subscriptionPlan: 'Free Trial', subscriptionStatus: 'Trial', permissions: allPermissionKeys };
      state.stores.push(store); return reply(store, 201);
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
    const userStores = path.match(/^\/api\/auth\/users\/([^/]+)\/stores$/);
    if (userStores && method === 'PUT') {
      const user = state.users.find(x => x.id === userStores[1])!;
      user.storeIds = request.postDataJSON().storeIds; return reply({ userId: user.id, storeIds: user.storeIds });
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
    if (path === '/api/customers' && method === 'GET') return reply(state.customers.map(customer => {
      const sales = state.sales.filter(sale => sale.customerId === customer.id);
      return { ...customer,
        paidTotal: sales.reduce((sum, sale) => sum + (['Not Received', 'Credit'].includes(sale.paymentMethod)
          ? Math.min(sale.paidTotal ?? 0, Math.max(0, sale.total - sale.returnedTotal)) : Math.max(0, sale.total - sale.returnedTotal)), 0),
        receivable: sales.filter(sale => ['Not Received', 'Credit'].includes(sale.paymentMethod))
          .reduce((sum, sale) => sum + Math.max(0, sale.total - sale.returnedTotal - (sale.paidTotal ?? 0)), 0) };
    }));
    if (path === '/api/customers' && method === 'POST') {
      const customer = { ...request.postDataJSON(), id: state.customers.length + 1, isActive: true };
      state.customers.push(customer); return reply({ id: customer.id }, 201);
    }
    const customerPath = path.match(/^\/api\/customers\/(\d+)(?:\/(ledger|status|payments))?$/);
    if (customerPath) {
      const customer = state.customers.find(x => x.id === Number(customerPath[1]));
      if (!customer) return reply({}, 404);
      if (customerPath[2] === 'status' && method === 'PUT') { customer.isActive = request.postDataJSON().isActive; return reply(customer); }
      if (customerPath[2] === 'ledger' && method === 'GET') {
        const customerSales = state.sales.filter(x => x.customerId === customer.id);
        const invoices = customerSales.filter(x => ['Not Received', 'Credit'].includes(x.paymentMethod)).map(x => ({ ...x,
          returned: x.returnedTotal, paid: x.paidTotal ?? 0, payments: [] }));
        const paidTotal = customerSales.reduce((sum, x) => sum + (['Not Received', 'Credit'].includes(x.paymentMethod)
          ? Math.min(x.paidTotal ?? 0, Math.max(0, x.total - x.returnedTotal)) : Math.max(0, x.total - x.returnedTotal)), 0);
        return reply({ customer, invoices, paidTotal, receivable: invoices.reduce((sum, x) => sum + Math.max(0, x.total - x.returned - x.paid), 0) });
      }
      if (customerPath[2] === 'payments' && method === 'POST') {
        const body = request.postDataJSON(); const sale = state.sales.find(x => x.id === body.saleId)!;
        sale.paidTotal = (sale.paidTotal ?? 0) + body.amount; return reply({ id: 1, amount: body.amount }, 201);
      }
      if (!customerPath[2] && method === 'PUT') { Object.assign(customer, request.postDataJSON()); return reply(customer); }
    }
    if (path === '/api/sales/customers' && method === 'GET') return reply(state.customers.filter(x => x.isActive).map(({ id, name }) => ({ id, name })));
    if (path === '/api/expenses/categories' && method === 'GET') return reply(state.expenseCategories);
    if (path === '/api/expenses/categories' && method === 'POST') {
      const category = { id: state.expenseCategories.length + 1, name: request.postDataJSON().name, isActive: true };
      state.expenseCategories.push(category); return reply(category, 201);
    }
    const expenseCategoryStatus = path.match(/^\/api\/expenses\/categories\/(\d+)\/status$/);
    if (expenseCategoryStatus && method === 'PUT') {
      const category = state.expenseCategories.find(x => x.id === Number(expenseCategoryStatus[1]))!;
      category.isActive = request.postDataJSON().isActive; return reply(category);
    }
    if (path === '/api/expenses' && method === 'GET') {
      const query = new URL(request.url()).searchParams; const from = query.get('from'); const to = query.get('to'); const categoryId = query.get('categoryId');
      return reply(state.expenses.filter(expense => (!from || expense.expenseDate >= from) && (!to || expense.expenseDate <= to) && (!categoryId || expense.categoryId === Number(categoryId))));
    }
    if (path === '/api/expenses' && method === 'POST') {
      const body = request.postDataJSON(); const category = state.expenseCategories.find(x => x.id === body.categoryId)!;
      const expense = { ...body, id: state.expenses.length + 1, category: category.name };
      state.expenses.push(expense); return reply({ id: expense.id }, 201);
    }
    if (path === '/api/reports/details' && method === 'GET') return reply({ sales: [], inventory: [], expenses: [], netSales: 0, costOfGoods: 0, expenseTotal: 0,
      netProfit: 0, returnedTotal: 0, inventoryCostValue: 0, inventorySaleValue: 0 });
    if (path === '/api/medicines' && method === 'POST') {
      const body = request.postDataJSON();
      if (state.medicines.some(m => body.barcode && m.barcode === body.barcode)) return reply('Barcode already exists.', 409);
      const medicine = { ...body, id: state.medicines.length + 1, stock: 0, isActive: true };
      state.medicines.push(medicine); return reply({ id: medicine.id }, 201);
    }
    const medicinePath = path.match(/^\/api\/medicines\/(\d+)(?:\/status)?$/);
    if (medicinePath && method === 'PUT') {
      const medicine = state.medicines.find(x => x.id === Number(medicinePath[1]))!;
      if (path.endsWith('/status')) medicine.isActive = request.postDataJSON().isActive;
      else Object.assign(medicine, request.postDataJSON());
      return reply(medicine);
    }
    if (path === '/api/suppliers' && method === 'GET') return reply(state.suppliers);
    if (path === '/api/suppliers' && method === 'POST') {
      const supplier = { ...request.postDataJSON(), id: state.suppliers.length + 1, isActive: true };
      state.suppliers.push(supplier); return reply({ id: supplier.id }, 201);
    }
    const supplierStatus = path.match(/^\/api\/suppliers\/(\d+)\/status$/);
    if (supplierStatus && method === 'PUT') {
      const supplier = state.suppliers.find(x => x.id === Number(supplierStatus[1]))!;
      supplier.isActive = request.postDataJSON().isActive; return reply(supplier);
    }
    const supplierPath = path.match(/^\/api\/suppliers\/(\d+)$/);
    if (supplierPath && method === 'PUT') {
      const supplier = state.suppliers.find(x => x.id === Number(supplierPath[1]))!;
      Object.assign(supplier, request.postDataJSON()); return reply(supplier);
    }
    if (path === '/api/inventory/movements') return reply(state.movements);
    if (path === '/api/inventory/adjustments' && method === 'POST') {
      const body = request.postDataJSON(); const batch = state.batches.find(x => x.id === body.batchId)!;
      batch.quantity += body.quantityChange;
      state.movements.push({ id: state.movements.length + 1, batchId: batch.id, medicine: batch.medicine, batch: batch.number, type: body.type, quantityChange: body.quantityChange, balanceAfter: batch.quantity, reason: body.reason, createdAt: new Date().toISOString() });
      return reply({ id: batch.id, quantity: batch.quantity });
    }
    if (path === '/api/inventory') return reply(state.unauthorizedInventory ? {} : state.batches, state.unauthorizedInventory ? 401 : 200);
    if (path === '/api/purchases' && method === 'GET') return reply(state.purchases);
    if (path === '/api/purchases/supplier-accounts' && method === 'GET') {
      return reply(state.suppliers.map(supplier => {
        const invoices = state.purchases.filter(purchase => purchase.supplier === supplier.name);
        const purchaseTotal = invoices.reduce((sum, purchase) => sum + purchase.total, 0);
        const returnedTotal = invoices.reduce((sum, purchase) => sum + purchase.returnedTotal, 0);
        const paidTotal = invoices.reduce((sum, purchase) => sum + purchase.paidTotal, 0);
        return { supplierId: supplier.id, supplier: supplier.name, invoiceCount: invoices.length,
          purchaseTotal, returnedTotal, paidTotal, balance: Math.max(0, purchaseTotal - returnedTotal - paidTotal) };
      }));
    }
    const supplierStatement = path.match(/^\/api\/purchases\/suppliers\/(\d+)\/statement$/);
    if (supplierStatement && method === 'GET') {
      const supplier = state.suppliers.find(item => item.id === Number(supplierStatement[1]));
      if (!supplier) return reply({}, 404);
      return reply({ supplierId: supplier.id, supplier: supplier.name,
        invoices: state.purchases.filter(purchase => purchase.supplier === supplier.name) });
    }
    const purchaseReturn = path.match(/^\/api\/purchases\/(\d+)\/returns$/);
    if (purchaseReturn && method === 'POST') {
      const purchase = state.purchases.find(x => x.id === Number(purchaseReturn[1]))!;
      const body = request.postDataJSON(); const line = purchase.lines.find(x => x.id === body.lines[0].purchaseLineId)!;
      line.returnedQuantity += body.lines[0].quantity; line.onHand -= body.lines[0].quantity;
      const batch = state.batches.find(x => x.number === line.batch); if (batch) batch.quantity -= body.lines[0].quantity;
      const total = body.lines[0].quantity * line.unitCost; purchase.returnedTotal += total;
      purchase.returns.push({ id: purchase.returns.length + 1, supplierReference: body.supplierReference, reason: body.reason, createdAt: new Date().toISOString(), total });
      return reply({ id: purchase.returns.length, total }, 201);
    }
    const purchasePayment = path.match(/^\/api\/purchases\/(\d+)\/payments$/);
    if (purchasePayment && method === 'POST') {
      const purchase = state.purchases.find(x => x.id === Number(purchasePayment[1]))!; const body = request.postDataJSON();
      purchase.paidTotal += body.amount; purchase.payments.push({ id: purchase.payments.length + 1, ...body, paidAt: new Date().toISOString() });
      return reply({ id: purchase.payments.length, amount: body.amount, method: body.method }, 201);
    }
    if (path === '/api/purchases' && method === 'POST') {
      const body = request.postDataJSON();
      expect(body.supplierInvoice).toBeTruthy(); expect(body.supplierId).toBe(2);
      for (const line of body.lines) {
        const medicine = state.medicines.find(m => m.id === line.medicineId)!;
        medicine.stock += line.quantity;
        state.batches.push({ id: state.batches.length + 1, medicineId: medicine.id, medicine: medicine.name, number: line.batchNumber,
          expiryDate: line.expiryDate, costPrice: line.costPrice, salePrice: line.salePrice, quantity: line.quantity });
      }
      const purchase = { id: state.purchases.length + 1, supplier: state.suppliers.find(x => x.id === body.supplierId)!.name,
        supplierInvoice: body.supplierInvoice, createdAt: new Date().toISOString(),
        total: body.lines.reduce((sum: number, x: { quantity: number; costPrice: number }) => sum + x.quantity * x.costPrice, 0),
        returnedTotal: 0, paidTotal: 0,
        lines: body.lines.map((line: { medicineId: number; batchNumber: string; quantity: number; costPrice: number }) => ({ id: state.purchases.length + 1, medicine: state.medicines.find(x => x.id === line.medicineId)!.name, batch: line.batchNumber, quantity: line.quantity, returnedQuantity: 0, unitCost: line.costPrice, onHand: line.quantity })),
        returns: [], payments: [] };
      state.purchases.push(purchase); return reply({ id: purchase.id, total: purchase.total }, 201);
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
      const sale = { id, invoiceNumber: `INV-${String(id).padStart(8, '0')}`, createdAt: new Date().toISOString(),
        subtotal: total, discountAmount: body.discountAmount ?? 0, total: total - (body.discountAmount ?? 0),
        paymentMethod: body.paymentMethod ?? 'Cash', returnedTotal: 0, customerId: body.customerId ?? null, paidTotal: 0 };
      const receiptLines = lines.map((line: { medicine: string; batch: string; quantity: number; unitPrice: number; total: number }, index: number) => ({
        saleLineId: index + 1, ...line, returnedQuantity: 0,
        discountAmount: index === 0 ? body.discountAmount ?? 0 : 0,
        total: line.total - (index === 0 ? body.discountAmount ?? 0 : 0),
      }));
      state.sales.push(sale); state.receipts[id] = { ...sale, customer: state.customers.find(c => c.id === body.customerId)?.name,
        cashReceived: body.cashReceived, lines: receiptLines };
      return reply({ ...sale, change: sale.paymentMethod === 'Cash' ? body.cashReceived - sale.total : 0 }, 201);
    }
    const saleReturn = path.match(/^\/api\/sales\/(\d+)\/returns$/);
    if (saleReturn && method === 'POST') {
      const id = Number(saleReturn[1]);
      const receipt = state.receipts[id] as { returnedTotal: number; lines: { saleLineId: number; quantity: number; returnedQuantity: number; unitPrice: number; discountAmount: number }[] };
      const body = request.postDataJSON(); const requestLine = body.lines[0];
      const line = receipt.lines.find(x => x.saleLineId === requestLine.saleLineId)!;
      line.returnedQuantity += requestLine.quantity;
      const refund = requestLine.quantity * (line.unitPrice - line.discountAmount / line.quantity);
      receipt.returnedTotal += refund; state.sales.find(x => x.id === id)!.returnedTotal = receipt.returnedTotal;
      if (requestLine.restock) state.batches[0].quantity += requestLine.quantity;
      return reply({ id: 1, totalRefund: refund, refundMethod: body.refundMethod }, 201);
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
    '/customers': 'Customers',
    '/expenses': 'Expenses',
    '/sales/pos': 'New sale',
    '/medicines': 'Medicines',
    '/purchases': 'Receive purchase',
    '/inventory': 'Inventory',
    '/suppliers': 'Suppliers',
    '/sales': 'Sales history',
    '/owner': 'Application Owner Admin Panel',
    '/users': 'Application Owner Admin Panel',
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

test('switching stores persists the active store and reloads the workspace', async ({ page }) => {
  await mockApi(page);
  await signIn(page, '/reports');
  await expect(page.getByLabel('Active store')).toHaveValue('1');
  const reload = page.waitForNavigation({ waitUntil: 'load' });
  await page.getByLabel('Active store').selectOption('2');
  await reload;
  await expect(page.getByLabel('Active store')).toHaveValue('2');
});

test('inventory movement report filters dates and purchase or sale sources with 20 rows per page', async ({ page }) => {
  const state = await mockApi(page);
  state.movements = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1, batchId: 1, medicine: 'Paracetamol 500mg', batch: 'LOT-01',
    type: index % 2 === 0 ? 'Purchase' : 'Sale', quantityChange: index % 2 === 0 ? 10 : -1,
    balanceAfter: 20, reason: '', createdAt: `2026-09-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
  }));
  await signIn(page, '/inventory');
  const report = page.locator('.movement-report');
  await expect(report.locator('tbody tr')).toHaveCount(20);
  await report.getByRole('button', { name: 'Next' }).click();
  await expect(report.locator('tbody tr')).toHaveCount(5);
  await expect(report.getByText('Page 2 of 2')).toBeVisible();

  await report.getByLabel('Movement type').selectOption('Purchase');
  await expect(report.locator('tbody tr')).toHaveCount(13);
  await expect(report.getByText('Page 1 of 1')).toBeVisible();
  await report.getByLabel('Movement type').selectOption('Sale');
  await expect(report.locator('tbody tr')).toHaveCount(12);
  await report.getByLabel('Movement type').selectOption('Purchase');
  await report.getByLabel('From date').fill('2026-09-10');
  await report.getByLabel('To date').fill('2026-09-20');
  await expect(report.locator('tbody tr')).toHaveCount(5);
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
  const supplierCard = page.locator('.supplier-card').filter({ hasText: 'City Pharma' });
  await supplierCard.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Contact person').fill('Ali Khan');
  await page.getByLabel('Phone').fill('03001234567');
  await page.getByLabel('Email').fill('ali@citypharma.example');
  await page.getByLabel('Address').fill('Main Market');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Supplier details updated.')).toBeVisible();
  await expect(page.locator('.supplier-card').filter({ hasText: 'City Pharma' })).toContainText('Ali Khan');
  await page.getByLabel('Filter suppliers').fill('Main Market');
  await expect(page.locator('.supplier-card')).toHaveCount(1);
  await page.getByLabel('Filter suppliers').fill('no matching supplier');
  await expect(page.getByText('No suppliers match this filter.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filter' }).click();
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
  await page.getByRole('button', { name: 'Return stock' }).click();
  await page.getByLabel('Supplier return reference').fill('RET-002');
  await page.getByLabel('Reason', { exact: true }).fill('Damaged packaging');
  await page.getByRole('button', { name: 'Save return' }).click();
  await expect(page.getByText('Supplier return recorded and stock reduced.')).toBeVisible();
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByLabel('Amount (Rs)')).toHaveValue('27');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText('Supplier payment recorded.')).toBeVisible();
  const accountRow = page.locator('.supplier-account-panel tbody tr').filter({ hasText: 'City Pharma' });
  await expect(accountRow).toContainText('Rs 0.00');
  await accountRow.getByRole('button', { name: 'View statement' }).click();
  const statement = page.locator('.supplier-statement');
  await expect(statement).toContainText('SUP-002');
  await statement.getByRole('button', { name: 'Invoice details' }).click();
  const invoiceDetail = page.locator('.panel.form-panel').filter({ hasText: 'Invoice SUP-002' });
  await expect(invoiceDetail).toContainText('RET-002');
  await expect(invoiceDetail).toContainText('Payment');
  await navigate(page, /Inventory/);
  await expect(page.getByRole('row').filter({ hasText: 'VC-02' })).toContainText('9');
  await page.locator('select[name="adj-batch"]').selectOption({ label: 'Vitamin C · VC-02 (9 units)' });
  await page.getByLabel('Reason', { exact: true }).fill('Broken units');
  await page.getByRole('button', { name: 'Record movement' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Broken units' })).toContainText('-1');
  await navigate(page, /Medicines/);
  const medicineRow = page.getByRole('row').filter({ hasText: 'Vitamin C' });
  await medicineRow.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Medicine name').fill('Vitamin C 500mg');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Vitamin C 500mg' })).toBeVisible();
  await page.getByRole('row').filter({ hasText: 'Vitamin C 500mg' }).getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Vitamin C 500mg' })).toContainText('Inactive');
});

test('customers track paid and due amounts, and POS can record an unpaid sale', async ({ page }) => {
  await mockApi(page); await signIn(page);
  await navigate(page, /Customers/);
  await page.getByLabel('Customer name').fill('Ayesha Khan');
  await page.getByRole('button', { name: 'Add customer' }).click();
  await expect(page.getByText('Ayesha Khan', { exact: true })).toBeVisible();
  await navigate(page, /New sale/);
  await page.getByRole('button', { name: /Paracetamol 500mg/ }).click();
  await page.getByLabel('Payment method').selectOption('Not Received');
  await expect(page.getByRole('button', { name: /Complete sale/ })).toBeDisabled();
  await page.locator('select[aria-label="Customer"]').selectOption({ label: 'Ayesha Khan' });
  await page.getByRole('button', { name: /Complete sale/ }).click();
  await expect(page.getByText('Sale completed. Invoice is ready to print.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await navigate(page, /Customers/);
  const customerRow = page.getByRole('row').filter({ hasText: 'Ayesha Khan' });
  await expect(customerRow).toContainText('Rs 5.00');
  await expect(customerRow).toContainText('Rs 0.00');
  await customerRow.getByRole('button', { name: 'Ledger' }).click();
  await expect(page.locator('.customer-ledger')).toContainText('INV-00000001');
  await page.locator('.customer-ledger').getByLabel('Amount (Rs)').fill('5');
  await page.locator('.customer-ledger').getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText('Customer payment recorded.')).toBeVisible();
  await expect(customerRow).toContainText('Rs 5.00');
  await expect(customerRow).toContainText('Rs 0.00');
});

test('store users can create expense categories, record expenses and filter the ledger by date', async ({ page }) => {
  await mockApi(page); await signIn(page);
  await navigate(page, /Expenses/);
  await page.getByLabel('New category').fill('Utilities');
  await page.locator('.category-form').getByRole('button', { name: 'Add' }).click();
  await page.locator('.expense-form select[name="category"]').selectOption({ label: 'Utilities' });
  await page.getByLabel('Description').fill('Electricity bill');
  await page.getByLabel('Amount (Rs)').fill('3200');
  await page.getByLabel('Date', { exact: true }).fill('2026-09-25');
  await page.getByRole('button', { name: 'Record expense' }).click();
  await expect(page.getByText('Expense recorded.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Electricity bill' })).toContainText('Rs 3,200.00');
  await page.getByLabel('Expense from date').fill('2026-09-26');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.getByText('No expenses for this filter.')).toBeVisible();
});

test('POS survives navigation, posts once, prints receipt and clears on logout', async ({ page }) => {
  const state = await mockApi(page); await signIn(page, '/sales/pos');
  await page.getByRole('button', { name: /Paracetamol 500mg/ }).click();
  await navigate(page, /Suppliers/); await navigate(page, /New sale/);
  await expect(page.locator('.cart-row')).toHaveCount(1);
  await page.getByLabel('Discount').fill('1');
  await page.getByLabel('Payment method').selectOption('Card');
  await page.getByRole('button', { name: /Complete sale/ }).click();
  await expect(page.locator('.receipt-paper')).toContainText('INV-00000001');
  await expect(page.locator('.receipt-paper')).toContainText('Card');
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
  await page.getByLabel('Sale return reason').fill('Customer changed mind');
  await page.getByRole('button', { name: 'Record return' }).click();
  await expect(page.getByText(/Return recorded/)).toBeVisible();
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
  await navigate(page, /Owner panel/);
  const mainStore = page.locator('.store-card').filter({ hasText: 'Main Store' });
  await mainStore.getByRole('button', { name: 'Start 14-day trial' }).click();
  expect(state.stores[0].subscriptionStatus).toBe('Trial');
  await mainStore.getByLabel('Status').selectOption('Active');
  await mainStore.getByRole('button', { name: 'Save subscription' }).click();
  await expect.poll(() => state.stores[0].subscriptionStatus).toBe('Active');
  await mainStore.getByRole('button', { name: 'Deactivate store' }).click();
  expect(state.stores[0].isActive).toBe(false);
  await mainStore.getByRole('button', { name: 'Activate store' }).click();
  expect(state.stores[0].isActive).toBe(true);
  await page.getByLabel('Email', { exact: true }).fill('cashier@example.com');
  await page.getByLabel('Initial password').fill('ValidStrongPassword123!');
  await page.getByRole('group', { name: 'Assign stores' }).getByLabel('Main Store').check();
  await page.getByLabel('Cashier', { exact: true }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  const userRow = page.getByRole('row').filter({ hasText: 'cashier@example.com' });
  await expect(userRow).toContainText('Cashier');
  await userRow.getByLabel('Roles for cashier@example.com').selectOption(['Pharmacist']);
  await userRow.getByRole('button', { name: 'Save roles' }).click();
  await expect(userRow).toContainText('Pharmacist');
  await userRow.getByLabel('New password for cashier@example.com').fill('ResetPassword123!');
  await userRow.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByText('Password reset for cashier@example.com. Share the new password with them securely.')).toBeVisible();
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

test('store administrators cannot open owner controls or call owner APIs', async ({ page }) => {
  await mockApi(page); await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('storeadmin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('ExamplePassword123!');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole('navigation').getByRole('link', { name: /Owner panel/ })).toHaveCount(0);
  await page.goto('/owner');
  await expect(page).toHaveURL(/\/forbidden$/);
  const response = await page.evaluate(async () => {
    const token = sessionStorage.getItem('medical-token');
    return fetch('/api/stores/all', { headers: { Authorization: `Bearer ${token}` } }).then(result => result.status);
  });
  expect(response).toBe(403);
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
