import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { AuthSession } from '../authentication/public-api';
import { ExpensesApi } from './expenses.api';
import { Expense, ExpenseCategory, SaveExpense } from './expenses.models';
@Component({ selector: 'app-expenses-page', imports: [CommonModule, FormsModule, PageNoticeComponent], styleUrl: './expenses.page.css', templateUrl: './expenses.page.html' })
export class ExpensesPage extends PageFeedback implements OnInit {
  private readonly api = inject(ExpensesApi); readonly session = inject(AuthSession);
  readonly categories = signal<ExpenseCategory[]>([]); readonly expenses = signal<Expense[]>([]);
  readonly categoryName = signal(''); readonly filterFrom = signal(''); readonly filterTo = signal(''); readonly filterCategory = signal<number | null>(null);
  readonly total = computed(() => this.expenses().reduce((sum, row) => sum + row.amount, 0));
  form: SaveExpense = this.emptyForm(); readonly methods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet'];
  ngOnInit(): void { void this.perform(async () => { this.categories.set(await this.api.categories()); await this.load(); }); }
  async load(): Promise<void> { this.expenses.set(await this.api.list(this.filterFrom(), this.filterTo(), this.filterCategory())); }
  applyFilter(): Promise<void> { return this.perform(() => this.load()); }
  addCategory(): Promise<void> { return this.perform(async () => { await this.api.createCategory(this.categoryName()); this.categoryName.set(''); this.categories.set(await this.api.categories()); this.message.set('Expense category added.'); }); }
  toggleCategory(category: ExpenseCategory): Promise<void> { return this.perform(async () => { await this.api.setCategoryActive(category.id, !category.isActive); this.categories.set(await this.api.categories()); }); }
  addExpense(): Promise<void> { return this.perform(async () => { await this.api.create(this.form); this.form = this.emptyForm(); await this.load(); this.message.set('Expense recorded.'); }); }
  private emptyForm(): SaveExpense { return { categoryId: 0, description: '', amount: 0, expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', reference: '', notes: '' }; }
}
