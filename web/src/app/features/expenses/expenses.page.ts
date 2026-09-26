import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { AuthSession } from '../authentication/public-api';
import { pageSlice, TABLE_PAGE_SIZE, TablePaginationComponent } from '../../shared/ui/table-pagination.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { ExpensesApi } from './expenses.api';
import { Expense, ExpenseCategory, SaveExpense } from './expenses.models';
@Component({ selector: 'app-expenses-page', imports: [CommonModule, FormsModule, PageNoticeComponent, TablePaginationComponent, ConfirmDialogComponent], styleUrl: './expenses.page.css', templateUrl: './expenses.page.html' })
export class ExpensesPage extends PageFeedback implements OnInit {
  private readonly api = inject(ExpensesApi); readonly session = inject(AuthSession);
  readonly categories = signal<ExpenseCategory[]>([]); readonly expenses = signal<Expense[]>([]);
  readonly pendingCategoryStatus = signal<ExpenseCategory | null>(null);
  readonly categoryName = signal(''); readonly filterFrom = signal(''); readonly filterTo = signal(''); readonly filterCategory = signal<number | null>(null);
  readonly expenseSearch = signal(''); readonly expensePage = signal(1); readonly categorySearch = signal(''); readonly categoryPage = signal(1);
  readonly pageSize = TABLE_PAGE_SIZE;
  readonly filteredExpenses = computed(() => { const term = this.expenseSearch().trim().toLocaleLowerCase(); return this.expenses().filter(row =>
    !term || [row.category, row.description, row.paymentMethod, row.reference].some(value => value?.toLocaleLowerCase().includes(term))); });
  readonly visibleExpenses = computed(() => pageSlice(this.filteredExpenses(), this.expensePage()));
  readonly total = computed(() => this.filteredExpenses().reduce((sum, row) => sum + row.amount, 0));
  readonly filteredCategories = computed(() => { const term = this.categorySearch().trim().toLocaleLowerCase(); return this.categories().filter(row => !term || row.name.toLocaleLowerCase().includes(term)); });
  readonly visibleCategories = computed(() => pageSlice(this.filteredCategories(), this.categoryPage()));
  form: SaveExpense = this.emptyForm(); readonly methods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet'];
  ngOnInit(): void { void this.perform(async () => { this.categories.set(await this.api.categories()); await this.load(); }); }
  async load(): Promise<void> { this.expenses.set(await this.api.list(this.filterFrom(), this.filterTo(), this.filterCategory())); this.expensePage.set(1); }
  applyFilter(): Promise<void> { return this.perform(() => this.load()); }
  addCategory(): Promise<void> { return this.perform(async () => { await this.api.createCategory(this.categoryName()); this.categoryName.set(''); this.categories.set(await this.api.categories()); this.message.set('Expense category added.'); }); }
  toggleCategory(category: ExpenseCategory): void { this.pendingCategoryStatus.set(category); }
  confirmCategoryStatus(): Promise<void> {
    const category = this.pendingCategoryStatus();
    if (!category) return Promise.resolve();
    return this.perform(async () => {
      await this.api.setCategoryActive(category.id, !category.isActive);
      this.categories.set(await this.api.categories());
      this.message.set(category.isActive ? 'Expense category deactivated.' : 'Expense category activated.');
      this.pendingCategoryStatus.set(null);
    });
  }
  addExpense(): Promise<void> { return this.perform(async () => { await this.api.create(this.form); this.form = this.emptyForm(); await this.load(); this.message.set('Expense recorded.'); }); }
  private emptyForm(): SaveExpense { return { categoryId: 0, description: '', amount: 0, expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: 'Cash', reference: '', notes: '' }; }
}
