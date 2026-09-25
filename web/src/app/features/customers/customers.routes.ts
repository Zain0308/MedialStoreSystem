import { Routes } from '@angular/router';
import { permissionGuard } from '../authentication/permission.guard';

export const CUSTOMERS_ROUTES: Routes = [{
  path: '', canActivate: [permissionGuard], data: { title: 'Customers', permissions: ['customers.read'] },
  loadComponent: () => import('./customers.page').then(m => m.CustomersPage),
}];
