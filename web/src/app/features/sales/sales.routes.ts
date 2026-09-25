import { Routes } from '@angular/router';
import { permissionGuard } from '../authentication/permission.guard';

export const SALES_ROUTES: Routes = [
  {
    path: 'pos',
    canActivate: [permissionGuard],
    data: { title: 'New sale', permissions: ['sales.create', 'medicines.read', 'inventory.read'] },
    loadComponent: () => import('./pos.page').then((m) => m.PosPage),
  },
  {
    path: '',
    canActivate: [permissionGuard],
    data: { title: 'Sales history', permissions: ['sales.read'] },
    loadComponent: () => import('./sales.page').then((m) => m.SalesPage),
  },
];
