import { Routes } from '@angular/router';

export const REPORTS_ROUTES: Routes = [
  {
    path: '',
    data: { title: 'Overview' },
    loadComponent: () => import('./reports.page').then((m) => m.ReportsPage),
  },
  {
    path: 'financial-accounts',
    data: { title: 'Financial Accounts' },
    loadComponent: () => import('./financial-accounts.page').then((m) => m.FinancialAccountsPage),
  },
];
