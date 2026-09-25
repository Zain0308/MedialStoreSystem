import { Routes } from '@angular/router';

export const SUPPLIERS_ROUTES: Routes = [
  {
    path: '',
    data: { title: 'Suppliers' },
    loadComponent: () => import('./suppliers.page').then((m) => m.SuppliersPage),
  },
];
