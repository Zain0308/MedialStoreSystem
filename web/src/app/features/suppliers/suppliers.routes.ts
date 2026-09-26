import { Routes } from '@angular/router';
import { permissionGuard } from '../authentication/permission.guard';

export const SUPPLIERS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [permissionGuard],
    data: { title: 'Suppliers', permissions: ['suppliers.read'] },
    loadComponent: () => import('./suppliers.page').then((m) => m.SuppliersPage),
  },
  {
    path: 'purchases',
    canActivate: [permissionGuard],
    data: { title: 'Supplier purchases', permissions: ['purchases.read'] },
    loadComponent: () => import('../purchases/purchases.page').then((m) => m.PurchasesPage),
  },
];
