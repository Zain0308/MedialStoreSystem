import { Routes } from '@angular/router';

export const SALES_ROUTES: Routes = [
  {
    path: 'pos',
    data: { title: 'New sale' },
    loadComponent: () => import('./pos.page').then((m) => m.PosPage),
  },
  {
    path: '',
    data: { title: 'Sales history' },
    loadComponent: () => import('./sales.page').then((m) => m.SalesPage),
  },
];
