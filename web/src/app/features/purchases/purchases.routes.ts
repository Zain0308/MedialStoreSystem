import { Routes } from '@angular/router';

export const PURCHASES_ROUTES: Routes = [
  {
    path: '',
    data: { title: 'Supplier purchases' },
    loadComponent: () => import('./purchases.page').then((m) => m.PurchasesPage),
  },
];
