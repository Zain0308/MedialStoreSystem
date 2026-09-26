Warning: truncated output (original token count: 17734)
Total output lines: 1018

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
    expiryBatches: [] as { id: number; medicineId: number; medicine: string; batch: string; expiryDate: string; quantity: number; costPrice: number; purchasedAt: string; supplier: string; supplierInvoice: string }[],
    sales: [] as { id: number; invoiceNumber: string; createdAt: string; subtotal: number; discountAmount: number; total: number; paymentMethod: string; returnedTotal: number; customerId?: number | null; paidTotal?: number }[],
    receipts: {} as Record<number, unknown>,
    purchases: [] as { id: number; supplier: string; supplierInvoice: string; createdAt: string; total: number; returnedTotal: number; paidTotal: number; lines: { id: number; medicine: string; batch: string; quantity: number; returnedQuantity: number; unitCost: number; onHand: number }[]; returns: { id: number; supplierReference: string; reason: string; createdAt: string; total: number }[]; payments: { id: number; amount: number; method: string; reference: string; paidAt: string }[]; corrections: { id: number; reason: string; createdAt: string; previousTotal: number; correctedTotal: number; lines: { purchaseLineId: number; medicine: string; batch: string; previousQuantity: number; correctedQuantity: number; quantityChange: number }[] }[] }[],
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
    subscriptionExpired: false,
    subscriptionDaysRemaining: null as number | null,
    subscriptionExpiresAt: null as string | null,
    salePosts: 0,
    reportQueries: [] as { from: string | null; to: string | null }[],
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
        isApplicationOwner, subscriptionExpired: state.subscriptionExpired, subscriptionExpiresAt: state.subscriptionExpiresAt,
        permissions: isCashier ? ['medicines.read', 'inventory.read', 'sales.read', 'sales.create'] : allPermissionKeys });
    }
    if (request.headers()['authorization'] !== 'Bearer test-token') return reply({}, 401);
    if (state.subscriptionExpired && path.startsWith('/api/') && path !== '/api/dashboard' && path !== '/api/auth/switch-store')
      return reply({ message: 'Subscription expired; only dashboard access is available.' }, 403);
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
    if (path === '/api/reports/details' && method === 'GET') {
      const query = new URL(request.url()).searchParams;
      state.reportQueries.push({ from: query.get('from'), to: query.get('to') });
      return reply({ sales: [], inventory: [], expenses: [], netSales: 0, costOfGoods: 0, expenseTotal: 0,
        netProfit: 0, returnedTotal: 0, inventoryCostValue: 0, inventorySaleValue: 0 });
    }
    if (path === '/api/reports/payables' && method === 'GET') return reply({
      payableTotal: 70, supplierCreditTotal: 0,
      suppliers: [{ supplierId: 1, supplier: 'Demo Pharma', invoiceCount: 1, purchaseTotal: 100, returnedTotal: 20, paidTotal: 10,
        balance: 70, payableAmount: 70, receivableAmount: 0,
        invoices: [{ id: 1, supplierInvoice: 'SUP-101', createdAt: '2026-09-01T12:00:00Z', total: 100, returned: 20, paid: 10,
          balance: 70, returns: [{ createdAt: '2026-09-02T12:00:00Z', supplierReference: 'RET-01', reason: 'Damaged', amount: 20 }],
          payments: [{ paidAt: '2026-09-03T12:00:00Z', amount: 10, method: 'Cash', reference: 'PAY-01' }] }]
      }],
    });
    if (path === '/api/reports/receivables' && method === 'GET') return reply({
      totalReceivable: 55,
      customers: [{ customerId: 1, customer: 'Ayesha Khan', phone: '03000000000', email: '', isActive: true, paidTotal: 5, amountDue: 55, invoiceCount: 1,
        invoices: [{ id: 2, invoiceNumber: 'INV-202', createdAt: '2026-09-04T12:00:00Z', total: 60, returned: 0, paid: 5, due: 55,
          payments: [{ paidAt: '2026-09-05T12:00:00Z', amount: 5, method: 'Cash', reference: 'RCPT-01' }] }]
      }],
    });
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
    if (path === '/api/inventory/expiry') return reply(state.expiryBatches);
    const medicineInventoryDetails = path.match(/^\/api\/inventory\/medicines\/(\d+)\/details$/);
    if (medicineInventoryDetails) {
      const medicineId = Number(medicineInventoryDetails[1]);
      const batches = state.batches.filter(batch => batch.medicineId === medicineId);
      const medicine = state.medicines.find(item => item.id === medicineId)!;
      const purchases = batches.map((batch, index) => ({ purchaseId: index + 1, purchaseLineId: index + 1,
        batchId: batch.id, batch: batch.number, supplier: 'Demo Pharma', supplierInvoice: `SUP-${index + 1}`,
        purchasedAt: `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00Z`, expiryDate: batch.expiryDate,
        quantity: batch.quantity + index, returnedQuantity: index, onHand: batch.quantity, unitCost: batch.costPrice,
        salePrice: batch.salePrice, invoiceTotal: (batch.quantity + index) * batch.costPrice,
        invoicePaid: batch.costPrice * 5, invoiceReturned: index * batch.costPrice }));
      return reply({ medicine, batches, purchases, payments: [], returns: [], corrections: [] });
    }
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
        const paidTotal = invoices.reduce((sum, purchase) => sum + purchase.payments
          .filter(payment => payment.method !== 'Supplier Credit').reduce((paid, payment) => paid + payment.amount, 0), 0);
        return { supplierId: supplier.id, supplier: supplier.name, invoiceCount: invoices.length,
          purchaseTotal, returnedTotal, paidTotal, balance: purchaseTotal - returnedTotal - paidTotal };
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
    const purchaseCorrections = path.match(/^\/api\/purchases\/(\d+)\/corrections$/);
    if (purchaseCorrections && method === 'GET') {
      const purchase = state.purchases.find(x => x.id === Number(purchaseCorrections[1]));
      return reply(purchase?.corrections ?? [], purchase ? 200 : 404);
    }
    if (purchaseCorrections && method === 'POST') {
      const purchase = state.purchases.find(x => x.id === Number(purchaseCorrections[1]))!;
      const body = request.postDataJSON(); const previousTotal = purchase.total;
      const lines = body.lines.map((change: { purchaseLineId: number; correctedQuantity: number }) => {
        const line = purchase.lines.find(x => x.id === change.purchaseLineId)!;
        const previousQuantity = line.quantity; const delta = change.correctedQuantity - previousQuantity;
        line.quantity = change.correctedQuantity; line.onHand += delta;
        const batch = state.batches.find(x => x.number === line.batch); if (batch) batch.quantity += delta;
        return { purchaseLineId: line.id, medicine: line.medicine, batch: line.batch, previousQuantity,
          correctedQuantity: change.correctedQuantity, quantityChange: delta };
      });
      purchase.total = purchase.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
      const correction = { id: purchase.corrections.length + 1, reason: body.reason, createdAt: new Date().toISOString(),
        previousTotal, correctedTotal: purchase.total, lines };
      purchase.corrections.push(correction); return reply(correction, 200);
    }
    const purchasePayment = path.match(/^\/api\/purchases\/(\d+)\/payments$/);
    if (purchasePayment && method === 'POST') {
      const purchase = state.purchases.find(x => x.id === Number(purchasePayment[1]))!; const body = request.postDataJSON();
      const outstanding = Math.max(0, purchase.total - purchase.returnedTotal - purchase.paidTotal);
      purchase.paidTotal += body.amount; purchase.payments.push({ id: purchase.payments.length + 1, ...body, paidAt: new Date().toISOString() });
      return reply({ id: purchase.payments.length, amount: body.amount, method: body.method,
        supplierCreditAdded: Math.max(0, body.amount - outstanding) }, 201);
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
      const supplier = state.suppliers.find(x => x.id === body.supplierId)!;
      const previousPurchases = state.purchases.filter(x => x.supplier === supplier.name);
      const externalPaid = previousPurchases.flatMap(x => x.payments)
        .filter(payment => payment.method !== 'Supplier Credit').reduce((sum, payment) => sum + payment.amount, 0);
      const netPreviousPurchases = previousPurchases.reduce((sum, x) => sum + x.total - x.returnedTotal, 0);
      const availableCredit = Math.max(0, externalPaid - netPreviousPurchases);
      const total = body.lines.reduce((sum: number, x: { quantity: number; costPrice: number }) => sum + x.quantity * x.costPrice, 0);
      const supplierCreditApplied = Math.min(total, availableCredit);
      const purchase = { id: state.purchases.length + 1, supplier: state.suppliers.find(x => x.id === body.supplierId)!.name,
        supplierInvoice: body.supplierInvoice, createdAt: new Date().toISOString(),
        total, returnedTotal: 0, paidTotal: supplierCreditApplied,
        lines: body.lines.map((line: { medicineId: number; batchNumber: string; quantity: number; costPrice: number }) => ({ id: state.purchases.length + 1, medicine: state.medicines.find(x => x.id === line.medicineId)!.name, batch: line.batchNumber, quantity: line.quantity, returnedQuantity: 0, unitCost: line.costPrice, onHand: line.quantity })),
        returns: [], corrections: [], payments: supplierCreditApplied > 0 ? [{ id: 1, amount: supplierCreditApplied,
          method: 'Supplier Credit', reference: 'Automatically applied from supplier credit', paidAt: new Date().toISOString() }] : [] };
      state.purchases.push(purchase); return reply({ id: purchase.id, total: purchase.total, supplierCreditApplied }, 201);
    }
    if (path === '/api/dashboard') return reply({ todaySales: state.subscriptionExpired ? 0 : state.sales.reduce((s, x) => s + x.total, 0), todayInvoices: state.subscriptionExpired ? 0 : state.sales.length, medicineCount: state.subscriptionExpired ? 0 : state.medicines.length, expiringBatches: 0, expiredBatches: 0, subscriptionDaysRemaining: state.subscriptionExpired ? null : state.subscriptionDaysRemaining, subscriptionExpiresAt: state.subscriptionExpiresAt, subscriptionExpired: state.subscriptionExpired });
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
      const totalDue = total - (body.discountAmount ?? 0);
      const amountPaid = body.paymentMethod === 'Not Received' ? 0 : (body.paymentMethod === 'Cash' ? Math.min(body.cashReceived, totalDue) : body.amountPaid ?? totalDue);
      const paymentMethod = amountPaid === 0 && body.paymentMethod === 'Not Received' ? 'Not Received' : amountPaid < totalDue ? 'Credit' : body.paymentMethod;
      const sale = { id, invoiceNumber: `INV-${String(id).padStart(8, '0')}`, createdAt: new Date().toISOString(),
        subtotal: total, discountAmount: body.discountAmount ?? 0, total: total - (body.discountAmount ?? 0),
        paymentMethod, returnedTotal: 0, customerId: body.customerId ?? null, paidTotal: amountPaid };
      const receiptLines = lines.map((line: { medicine: string; batch: string; quantity: number; unitPrice: number; total: number }, index: number) => ({
        saleLineId: index + 1, ...line, returnedQuantity: 0,
        discountAmount: index === 0 ? body.discountAmount ?? 0 : 0,
        total: line.total - (index === 0 ? body.discountAmount ?? 0 : 0),
      }));
      state.sales.push(sale); state.receipts[id] = { ...sale, customer: state.customers.find(c => c.id === body.customerId)?.name,
        cashReceived: body.cashReceived, paidTotal: amountPaid, lines: receiptLines };
      return reply({ ...sale, change: body.paymentMethod === 'Cash' ? Math.max(0, body.cashReceived - amountPaid) : 0 }, 201);
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
    return reply(`Unexpected A…1734 tokens truncated…);
  await expect(details).toContainText('Showing 1–1 of 1');
  await expect(details).toContainText('Supplier credit Rs 4.00');
  await details.getByRole('tab', { name: /Payments/ }).click();
  await expect(details).toContainText('No payments recorded');
  await details.getByRole('button', { name: 'Close medicine details' }).click();
  await expect(details).toHaveCount(0);
});

test('expiry tracking shows purchase details and filters upcoming and expired batches', async ({ page }) => {
  const state = await mockApi(page);
  const expiryDate = (offset: number) => {
    const date = new Date(); date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  state.expiryBatches.push(...Array.from({ length: 21 }, (_, index) => ({ id: index + 1, medicineId: 1,
    medicine: `Medicine ${String(index + 1).padStart(2, '0')}`, batch: `BATCH-${index + 1}`, expiryDate: expiryDate(25),
    quantity: 10, costPrice: 12, purchasedAt: '2026-08-20T12:00:00Z', supplier: 'Demo Pharma', supplierInvoice: `INV-${index + 1}` })));
  state.expiryBatches.push({ id: 22, medicineId: 1, medicine: 'Old medicine', batch: 'OLD-01', expiryDate: expiryDate(-5),
    quantity: 3, costPrice: 8, purchasedAt: '2026-07-01T12:00:00Z', supplier: 'Old Supplier', supplierInvoice: 'OLD-INV' });
  await signIn(page, '/inventory/expiry');
  await expect(page.getByRole('heading', { name: 'Medicine expiry' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Expiry tracking/ })).toHaveClass(/active/);
  await expect(page.getByRole('link', { name: 'Inventory' })).not.toHaveClass(/active/);
  const table = page.locator('.expiry-table');
  await expect(table.locator('tbody tr')).toHaveCount(20);
  await expect(table).toContainText('Demo Pharma');
  await expect(table).toContainText('INV-1');
  await expect(table).toContainText('Aug 20, 2026');
  await page.getByRole('button', { name: /All stocked batches/ }).click();
  await page.getByLabel('Search expiry batches').fill('OLD-INV');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('Old medicine');
  await expect(table).toContainText('Expired');
  await page.getByRole('button', { name: /Already expired/ }).click();
  await page.getByLabel('Search expiry batches').fill('');
  await expect(table.locator('tbody tr')).toHaveCount(1);
});

test('inventory purchase dialog adds and selects supplier and medicine inline', async ({ page }) => {
  await mockApi(page);
  await signIn(page, '/inventory');
  await page.getByRole('button', { name: 'Purchase Paracetamol 500mg' }).click();
  const existingMedicineDialog = page.getByRole('dialog', { name: 'Create purchase' });
  await expect(existingMedicineDialog.getByLabel('Paracetamol 500mg batch number')).toBeVisible();
  await existingMedicineDialog.getByRole('button', { name: 'Close purchase form' }).click();
  await page.getByRole('button', { name: /Create purchase/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Create purchase' });

  await dialog.getByLabel('Search purchase supplier').fill('New Pharma');
  await dialog.getByRole('button', { name: /Add new supplier/ }).click();
  await dialog.getByLabel('New supplier phone').fill('03001234567');
  await dialog.getByRole('button', { name: 'Add and select supplier' }).click();
  await expect(dialog.getByText('Selected: New Pharma')).toBeVisible();

  await dialog.getByLabel('Search purchase medicine').fill('Amoxicillin 500mg');
  await dialog.getByRole('button', { name: /Add new medicine/ }).click();
  await dialog.getByLabel('New medicine name').fill('Amoxicillin 500mg');
  await dialog.getByRole('button', { name: 'Add and select medicine' }).click();
  await dialog.getByLabel('Amoxicillin 500mg batch number').fill('AMX-01');
  const expiry = new Date(); expiry.setDate(expiry.getDate() + 365);
  await dialog.getByLabel('Amoxicillin 500mg expiry date').fill(expiry.toISOString().slice(0, 10));
  await dialog.getByLabel('Amoxicillin 500mg quantity').fill('30');
  await dialog.getByLabel('Amoxicillin 500mg unit cost').fill('12');
  await dialog.getByLabel('Amoxicillin 500mg sale price').fill('18');
  await dialog.getByLabel('Purchase supplier invoice').fill('NEW-INV-1');
  await dialog.getByRole('button', { name: 'Receive purchase' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.inventory-product-table')).toContainText('Amoxicillin 500mg');
  await expect(page.locator('.inventory-product-table')).toContainText('30');
});

test('financial reports filter profit and loss by month and show supplier and customer balances', async ({ page }) => {
  const state = await mockApi(page);
  await signIn(page, '/reports');
  const dashboard = page.locator('.financial-shortcuts');
  await expect(dashboard).toBeVisible();
  await expect(page.locator('.financial-accounts')).toHaveCount(0);
  await dashboard.getByRole('link', { name: /View customer accounts/ }).click();
  await expect(page).toHaveURL(/\/reports\/financial-accounts\?tab=receivables$/);
  const accounts = page.locator('.financial-accounts');

  await accounts.getByRole('tab', { name: 'Profit & Loss' }).click();
  await accounts.getByLabel('Profit and loss month').fill('2026-02');
  await accounts.getByRole('button', { name: 'Apply month' }).click();
  await expect.poll(() => state.reportQueries.at(-1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });

  await accounts.getByRole('tab', { name: 'Payables' }).click();
  await expect(accounts.getByText('Demo Pharma')).toBeVisible();
  await expect(accounts.getByText('Rs 70.00').first()).toBeVisible();
  await accounts.locator('summary', { hasText: 'Invoices' }).first().click();
  await expect(accounts.getByText('SUP-101')).toBeVisible();
  await expect(accounts.getByText('Payment Cash')).toBeVisible();

  await accounts.getByRole('tab', { name: 'Receivables' }).click();
  await expect(accounts.getByText('Ayesha Khan')).toBeVisible();
  await expect(accounts.getByText('Rs 55.00').first()).toBeVisible();
  await accounts.locator('summary', { hasText: 'Invoices' }).click();
  await expect(accounts.getByText('INV-202')).toBeVisible();
  await expect(accounts.getByText('RCPT-01')).toBeVisible();
});

test('medicine, supplier and purchase pages keep their own forms and update inventory', async ({ page }) => {
  await mockApi(page); await signIn(page);
  await navigate(page, /Medicines/);
  await page.getByLabel('Medicine name').fill('Vitamin C');
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
  await page.getByLabel('Search supplier').fill('City');
  await page.getByRole('button', { name: /City Pharma/ }).click();
  await page.getByLabel('Supplier invoice').fill('SUP-002');
  await page.getByLabel('Purchase medicine').fill('Vitamin C');
  await page.getByRole('option').filter({ hasText: 'Vitamin C' }).click();
  await page.getByLabel('Batch number').fill('VC-02');
  await page.getByLabel('Expiry date').fill('2050-12-31');
  await page.getByLabel('Quantity (units)').fill('10');
  await page.getByLabel('Unit cost (Rs)').fill('3');
  await page.getByLabel('Sale price (Rs)').fill('5');
  await page.getByRole('button', { name: /Receive batch/ }).click();
  await expect(page.getByText('Purchase received; batch stock updated.')).toBeVisible();
  await page.getByRole('button', { name: 'Invoice details' }).click();
  await expect(page.getByLabel('Supplier return reference')).toHaveCount(0);
  await expect(page.getByLabel('Amount (Rs)')).toHaveCount(0);
  await page.getByLabel('Correct quantity for Vitamin C batch VC-02').fill('9');
  await page.getByLabel('Correction reason').fill('Quantity was entered incorrectly');
  await page.getByRole('button', { name: 'Save purchase correction' }).click();
  await expect(page.getByText(/Purchase corrected\. Total changed from Rs 30\.00 to Rs 27\.00/)).toBeVisible();
  await page.getByRole('button', { name: 'Return stock' }).click();
  await expect(page.getByLabel('Supplier return reference')).toBeVisible();
  await expect(page.getByLabel('Amount (Rs)')).toHaveCount(0);
  await expect(page.getByLabel('Correct quantity for Vitamin C batch VC-02')).toHaveCount(0);
  await page.getByLabel('Supplier return reference').fill('RET-002');
  await page.getByLabel('Reason', { exact: true }).fill('Damaged packaging');
  await page.getByRole('button', { name: 'Save return' }).click();
  await expect(page.getByText('Supplier return recorded and stock reduced.')).toBeVisible();
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByLabel('Supplier return reference')).toHaveCount(0);
  await expect(page.getByLabel('Amount (Rs)')).toHaveValue('24');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText('Supplier payment recorded.')).toBeVisible();
  const accountRow = page.locator('.supplier-account-panel tbody tr').filter({ hasText: 'City Pharma' });
  await expect(accountRow).toContainText('Rs 0.00');
  await accountRow.getByRole('button', { name: 'View statement' }).click();
  const statement = page.locator('.supplier-statement');
  await expect(statement).toContainText('SUP-002');
  const [supplierLedgerDownload] = await Promise.all([
    page.waitForEvent('download'), statement.getByRole('button', { name: 'Download full ledger CSV' }).click(),
  ]);
  expect(supplierLedgerDownload.suggestedFilename()).toBe('supplier-ledger-City-Pharma.csv');
  await statement.getByRole('button', { name: 'Invoice details' }).click();
  const invoiceDetail = page.locator('.panel.form-panel').filter({ hasText: 'Invoice SUP-002' });
  await expect(invoiceDetail).toContainText('RET-002');
  await expect(invoiceDetail).toContainText('Purchase correction history');
  await expect(invoiceDetail).toContainText('Quantity was entered incorrectly');
  await expect(invoiceDetail).toContainText('Payment');
  await navigate(page, /Inventory/);
  await expect(page.getByRole('row').filter({ hasText: 'VC-02' })).toContainText('8');
  await page.getByRole('textbox', { name: 'Batch to adjust' }).fill('VC-02');
  await page.getByRole('option').filter({ hasText: 'Vitamin C' }).filter({ hasText: 'VC-02' }).click();
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
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Vitamin C 500mg' })).toContainText('Inactive');
});

test('customers track paid and due amounts, and POS can record an unpaid sale', async ({ page }) => {
  const state = await mockApi(page); await signIn(page);
  await navigate(page, /Customers/);
  await page.getByLabel('Customer name').fill('Ayesha Khan');
  await page.getByRole('button', { name: 'Add customer' }).click();
  await expect(page.getByText('Ayesha Khan', { exact: true })).toBeVisible();
  await navigate(page, /New sale/);
  await page.getByRole('button', { name: /Paracetamol 500mg/ }).click();
  await page.getByLabel('Payment method').selectOption('Not Received');
  await expect(page.getByRole('button', { name: /Complete sale/ })).toBeDisabled();
  await page.getByLabel('Customer search').fill('Ayesha');
  await page.getByRole('button', { name: 'Ayesha Khan', exact: true }).click();
  await page.getByRole('button', { name: /Complete sale/ }).click();
  await expect(page.getByText('Sale completed. Invoice is ready to print.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  state.sales.push({ ...state.sales[0], id: 2, invoiceNumber: 'INV-00000002', subtotal: 12,
    total: 12, returnedTotal: 0, paidTotal: 0 });
  await navigate(page, /Customers/);
  const customerRow = page.getByRole('row').filter({ hasText: 'Ayesha Khan' });
  await expect(customerRow).toContainText('Rs 0.00');
  await expect(customerRow).toContainText('Rs 17.00');
  await customerRow.getByRole('button', { name: 'Ledger' }).click();
  await expect(page.locator('.customer-form')).toHaveCount(0);
  await expect(page.locator('.customer-ledger')).toContainText('INV-00000001');
  await expect(page.locator('.customer-ledger')).toContainText('INV-00000002');
  await customerRow.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('.customer-ledger')).toHaveCount(0);
  await expect(page.getByLabel('Customer name')).toHaveValue('Ayesha Khan');
  await page.locator('.customer-form').getByRole('button', { name: 'Close' }).click();
  await customerRow.getByRole('button', { name: 'Ledger' }).click();
  const firstInvoice = page.locator('.invoice-ledger').filter({ hasText: 'INV-00000001' });
  const secondInvoice = page.locator('.invoice-ledger').filter({ hasText: 'INV-00000002' });
  await firstInvoice.getByLabel('Payment amount for invoice INV-00000001').fill('3');
  await expect(secondInvoice.getByLabel('Payment amount for invoice INV-00000002')).toHaveValue('12');
  const [customerLedgerDownload] = await Promise.all([
    page.waitForEvent('download'), page.locator('.customer-ledger').getByRole('button', { name: 'Download full ledger CSV' }).click(),
  ]);
  expect(customerLedgerDownload.suggestedFilename()).toBe('customer-ledger-Ayesha-Khan.csv');
  await firstInvoice.getByLabel('Payment amount for invoice INV-00000001').fill('5');
  await firstInvoice.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText('Customer payment recorded.')).toBeVisible();
  await expect(customerRow).toContainText('Rs 5.00');
  await expect(customerRow).toContainText('Rs 12.00');
  await firstInvoice.getByRole('button', { name: 'View receipt / process return' }).click();
  await expect(page.locator('.receipt')).toContainText('MEDICAL STORE');
  await expect(page.locator('.receipt')).toContainText('INV-00000001');
  await page.locator('.receipt').getByRole('button', { name: 'Close' }).click();
  await firstInvoice.getByRole('button', { name: 'View receipt / process return' }).click();
  await page.getByLabel('Customer return reason').fill('Customer returned unopened medicine');
  await page.getByRole('button', { name: 'Record customer return' }).click();
  await expect(page.getByText(/Customer return recorded/)).toBeVisible();
  await expect(page.locator('.customer-ledger')).toContainText('Returned Rs 5.00');
  await customerRow.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.locator('.customer-ledger')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Deactivate customer' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
  await expect(customerRow).toContainText('Inactive');
  await customerRow.getByRole('button', { name: 'Activate' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Activate' }).click();
  await expect(customerRow).toContainText('Active');
  await navigate(page, /New sale/);
  await page.getByRole('button', { name: /Paracetamol 500mg/ }).click();
  await page.getByLabel('Customer search').fill('Ayesha');
  await page.getByRole('button', { name: 'Ayesha Khan', exact: true }).click();
  await page.getByLabel('Payment method').selectOption('Card');
  await page.getByLabel('Amount paid now').fill('2.5');
  await page.getByRole('button', { name: /Complete sale/ }).click();
  await expect(page.locator('.receipt')).toContainText('Balance due');
  await expect(page.locator('.receipt')).toContainText('Rs 2.50');
});

test('POS can add a customer without losing the current sale or payment details', async ({ page }) => {
  const state = await mockApi(page); await signIn(page, '/sales/pos');
  await page.getByRole('button', { name: /Paracetamol 500mg/ }).click();
  await page.getByLabel('Discount').fill('1');
  await page.getByLabel('Payment method').selectOption('Not Received');
  await expect(page.getByRole('button', { name: /Complete sale/ })).toBeDisabled();
  await page.getByRole('button', { name: /Add customer/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Add customer' });
  await dialog.getByLabel('New customer name').fill('Sara Ahmed');
  await dialog.getByLabel('Customer phone').fill('03001234567');
  await dialog.getByLabel('Customer email').fill('sara@example.com');
  await dialog.getByRole('button', { name: 'Add and select' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.cart-row')).toContainText('Paracetamol 500mg');
  await expect(page.getByLabel('Discount')).toHaveValue('1');
  await expect(page.getByText('Selected: Sara Ahmed')).toBeVisible();
  await expect(page.getByRole('button', { name: /Complete sale/ })).toBeEnabled();
  await page.getByRole('button', { name: /Complete sale/ }).click();
  expect(state.customers).toHaveLength(1);
  expect(state.customers[0]).toMatchObject({ name: 'Sara Ahmed', phone: '03001234567', email: 'sara@example.com' });
  expect(state.sales[0]).toMatchObject({ customerId: state.customers[0].id, total: 4, paymentMethod: 'Not Received' });
});

test('supplier overpayment requires confirmation and carries forward to that supplier', async ({ page }) => {
  const state = await mockApi(page);
  state.suppliers.push({ id: 2, name: 'City Pharma', phone: '03000000000', contactPerson: '', email: '', address: '', isActive: true });
  await signIn(page); await navigate(page, /Purchases/);
  await page.getByLabel('Search supplier').fill('City');
  await page.getByRole('button', { name: /City Pharma/ }).click();
  await page.getByLabel('Supplier invoice').fill('SUP-ADV-01');
  await page.getByRole('textbox', { name: 'Purchase medicine' }).fill('Paracetamol');
  await page.getByRole('option').filter({ hasText: 'Paracetamol 500mg' }).click();
  await page.getByLabel('Batch number').fill('ADV-01');
  await page.getByLabel('Expiry date').fill('2050-12-31');
  await page.getByLabel('Quantity (units)').fill('2');
  await page.getByLabel('Unit cost (Rs)').fill('5');
  await page.getByLabel('Sale price (Rs)').fill('8');
  await page.getByRole('button', { name: /Receive batch/ }).click();
  await expect(page.getByText('Purchase received; batch stock updated.')).toBeVisible();

  const firstInvoice = page.getByRole('row').filter({ hasText: 'SUP-ADV-01' });
  await firstInvoice.getByRole('button', { name: 'Record payment' }).click();
  await page.getByLabel('Amount (Rs)').fill('20');
  await page.getByRole('button', { name: 'Save payment' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Confirm supplier overpayment' });
  await expect(confirmation).toContainText('extra Rs 10.00');
  await confirmation.getByRole('button', { name: 'Yes, continue' }).click();
  await expect(page.getByText(/Rs 10.00 added to supplier credit/)).toBeVisible();
  const accountRow = page.locator('.supplier-account-panel tbody tr').filter({ hasText: 'City Pharma' });
  await expect(accountRow).toContainText('Credit Rs 10.00');

  await page.getByLabel('Supplier invoice').fill('SUP-ADV-02');
  await page.getByRole('textbox', { name: 'Purchase medicine' }).fill('Paracetamol');
  await page.getByRole('option').filter({ hasText: 'Paracetamol 500mg' }).click();
  await page.getByLabel('Batch number').fill('ADV-02');
  await page.getByLabel('Quantity (units)').fill('1');
  await page.getByLabel('Unit cost (Rs)').fill('6');
  await page.getByLabel('Sale price (Rs)').fill('9');
  await page.getByRole('button', { name: /Receive batch/ }).click();
  await expect(page.getByText('Purchase received; batch stock updated. Rs 6.00 supplier credit was applied.')).toBeVisible();
  await expect(accountRow).toContainText('Credit Rs 4.00');
  expect(state.purchases[1].payments[0]).toMatchObject({ amount: 6, method: 'Supplier Credit' });
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
  await page.getByLabel('Cash received now (Rs)').fill('10');
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
  await page.getByLabel('Barcode (optional)', { exact: true }).fill('12345');
  await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
  await expect(page.getByText('Barcode already exists.')).toBeVisible();
  await expect(page.getByLabel('Medicine name')).toHaveValue('Duplicate medicine');
});

test('admins can create users, configure roles and deactivate access', async ({ page }) => {
  const state = await mockApi(page); await signIn(page);
  await navigate(page, /Owner panel/);
  const mainStore = page.locator('.store-card').filter({ hasText: 'Main Store' });
  await mainStore.getByRole('button', { name: 'Start 14-day trial' }).click();
  await expect(page.getByText('A 14-day free trial started for Main Store.')).toBeVisible();
  expect(state.stores[0].subscriptionStatus).toBe('Trial');
  await mainStore.getByLabel('Status').selectOption('Active');
  await mainStore.getByRole('button', { name: 'Save subscription' }).click();
  await expect.poll(() => state.stores[0].subscriptionStatus).toBe('Active');
  await mainStore.getByRole('button', { name: 'Deactivate store' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate store' }).click();
  expect(state.stores[0].isActive).toBe(false);
  await mainStore.getByRole('button', { name: 'Activate store' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Activate store' }).click();
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
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate account' }).click();
  await expect(userRow).toContainText('Inactive');

  await page.getByLabel('New role name').fill('Store Supervisor');
  await page.getByRole('button', { name: 'Add role' }).click();
  const supervisor = page.locator('.role-card').filter({ has: page.getByRole('heading', { name: 'Store Supervisor' }) });
  await supervisor.getByLabel('View reports and dashboard').check();
  await supervisor.getByRole('button', { name: 'Save user permissions' }).click();
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
