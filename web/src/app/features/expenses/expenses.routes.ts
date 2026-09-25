import { Routes } from '@angular/router';
import { permissionGuard } from '../authentication/permission.guard';
export const EXPENSES_ROUTES: Routes = [{ path: '', canActivate: [permissionGuard], data: { title: 'Expenses', permissions: ['expenses.read'] }, loadComponent: () => import('./expenses.page').then(m => m.ExpensesPage) }];
