import { Routes } from '@angular/router';

export const INVENTORY_ROUTES: Routes = [
  {
    path: '',
    data: { title: 'Inventory' },
    loadComponent: () => import('./inventory.page').then((m) => m.InventoryPage),
  },
];
