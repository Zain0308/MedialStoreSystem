import { Routes } from '@angular/router';
import { authGuard } from './features/authentication/auth.guard';
import { usersManageGuard } from './features/authentication/users-manage.guard';
import { permissionGuard } from './features/authentication/permission.guard';
import { subscriptionGuard } from './features/authentication/subscription.guard';

export const APP_ROUTES: Routes = [
  {
    path: 'login',
    loadChildren: () =>
      import('./features/authentication/authentication.routes').then(
        (m) => m.AUTHENTICATION_ROUTES,
      ),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard, subscriptionGuard],
    loadComponent: () => import('./core/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'reports' },
      {
        path: 'forbidden',
        data: { title: 'Access denied' },
        loadComponent: () =>
          import('./features/authentication/forbidden.page').then((m) => m.ForbiddenPage),
      },
      {
        path: 'medicines',
        canActivate: [permissionGuard],
        data: { permissions: ['medicines.read'] },
        loadChildren: () =>
          import('./features/medicines/medicines.routes').then((m) => m.MEDICINES_ROUTES),
      },
      {
        path: 'inventory',
        canActivate: [permissionGuard],
        data: { permissions: ['inventory.read'] },
        loadChildren: () =>
          import('./features/inventory/inventory.routes').then((m) => m.INVENTORY_ROUTES),
      },
      { path: 'purchases', redirectTo: 'suppliers/purchases', pathMatch: 'full' },
      {
        path: 'sales',
        loadChildren: () => import('./features/sales/sales.routes').then((m) => m.SALES_ROUTES),
      },
      { path: 'customers', canActivate: [permissionGuard], data: { permissions: ['customers.read'] },
        loadChildren: () => import('./features/customers/customers.routes').then(m => m.CUSTOMERS_ROUTES) },
      { path: 'expenses', canActivate: [permissionGuard], data: { permissions: ['expenses.read'] },
        loadChildren: () => import('./features/expenses/expenses.routes').then(m => m.EXPENSES_ROUTES) },
      {
        path: 'suppliers',
        loadChildren: () =>
          import('./features/suppliers/suppliers.routes').then((m) => m.SUPPLIERS_ROUTES),
      },
      {
        path: 'reports',
        canActivate: [permissionGuard],
        data: { permissions: ['reports.read', 'medicines.read', 'sales.read'] },
        loadChildren: () =>
          import('./features/reports/reports.routes').then((m) => m.REPORTS_ROUTES),
      },
      {
        path: 'owner',
        canActivate: [usersManageGuard],
        data: { title: 'Application Owner Admin Panel' },
        loadComponent: () =>
          import('./features/authentication/user-management.page').then((m) => m.UserManagementPage),
      },
      {
        path: 'users',
        canActivate: [usersManageGuard],
        data: { title: 'Application Owner Admin Panel' },
        loadComponent: () =>
          import('./features/authentication/user-management.page').then((m) => m.UserManagementPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
