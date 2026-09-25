import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Expense, ExpenseCategory, SaveExpense } from './expenses.models';
@Injectable({ providedIn: 'root' })
export class ExpensesApi {
  private readonly api = inject(ApiClient);
  categories() { return this.api.get<ExpenseCategory[]>('/expenses/categories'); }
  createCategory(name: string) { return this.api.post<ExpenseCategory>('/expenses/categories', { name }); }
  setCategoryActive(id: number, isActive: boolean) { return this.api.put<ExpenseCategory>(`/expenses/categories/${id}/status`, { isActive }); }
  list(from: string, to: string, categoryId: number | null) {
    const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to); if (categoryId) query.set('categoryId', String(categoryId));
    return this.api.get<Expense[]>(`/expenses?${query}`);
  }
  create(input: SaveExpense) { return this.api.post<{ id: number }>('/expenses', input); }
}
