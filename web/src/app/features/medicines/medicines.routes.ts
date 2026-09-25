import { Routes } from '@angular/router';

export const MEDICINES_ROUTES: Routes = [
  {
    path: '',
    data: { title: 'Medicines' },
    loadComponent: () => import('./medicines.page').then((m) => m.MedicinesPage),
  },
];
