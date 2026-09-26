import { Routes } from '@angular/router';

export const INVENTORY_ROUTES: Routes = [
  {
    path: 'expiry',
    data: { title: 'Expiry tracking' },
    loadComponent: () => import('./inventory-expiry.page').then((m) => m.InventoryExpiryPage),
  },
  {
    path: '',
    data: { title: 'Inventory' },
    loadComponent: () => import('./inventory.page').then((m) => m.InventoryPage),
  },
];
