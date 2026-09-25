import { Routes } from '@angular/router';

export const AUTHENTICATION_ROUTES: Routes = [
  {
    path: '',
    data: { title: 'Sign in' },
    loadComponent: () => import('./login.page').then((m) => m.LoginPage),
  },
];
