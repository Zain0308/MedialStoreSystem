import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { RouterLink } from '@angular/router';
import { Medicine, MedicinesApi } from '../medicines/public-api';
import { Supplier, SuppliersApi } from '../suppliers/public-api';
import { PurchasesApi } from './purchases.api';
import { PurchaseHistory, SupplierAccountSummary, SupplierStatement } from './purchases.models';
import { AuthSession } from '../authentication/public-api';
import { pageSlice, TABLE_PAGE_SIZE, TablePaginationComponent } from '../../shared/ui/table-pagination.component';
import { downloadCsv, safeFilename } from '../../shared/utils/csv-download';

@Component({
  selector: 'app-purchases-page',
  imports: [CommonModule, FormsModule, RouterLink, PageNoticeComponent, TablePaginationComponent],
  templateUrl: './purchases.page.html',
})
export class PurchasesPage extends PageFeedback implements OnInit {
  private readonly api = inject(PurchasesApi);
  readonly session = inject(AuthSession);
  private readonly medicinesApi = inject(MedicinesApi);
  private readonly suppliersApi = inject(SuppliersApi);
  readonly medicines = signal<Medicine[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly supplierPickerSearch = signal('');
  readonly matchingSuppliers = computed(() => {
    const term = this.supplierPickerSearch().trim().toLocaleLowerCase();
    if (!term) return [];
    const selected = this.suppliers().find(supplier => supplier.id === this.purchase.supplierId);
    if (selected?.name.toLocaleLowerCase() === term) return [];
    return this.suppliers().filter(supplier => supplier.isActive &&
      [supplier.name, supplier.contactPerson ?? '', supplier.phone ?? ''].some(value => value.toLocaleLowerCase().includes(term)))
      .slice(0, 10);
  });
  readonly purchases = signal<PurchaseHistory[]>([]);
  readonly supplierAccounts = signal<SupplierAccountSummary[]>([]);
  readonly selectedSupplierStatement = signal<SupplierStatement | null>(null);
  readonly selectedPurchase = signal<PurchaseHistory | null>(null);
  readonly supplierSearch = signal('');
  readonly supplierBalanceFilter = signal('all');
  readonly supplierPage = signal(1);
  readonly statementSearch = signal('');
  readonly statementFrom = signal('');
  readonly statementTo = signal('');
  readonly statementPage = signal(1);
  readonly purchaseSearch = signal('');
  readonly purchaseFrom = signal('');
  readonly purchaseTo = signal('');
  readonly purchasePage = signal(1);
  readonly transactionSearch = signal('');
  readonly transactionType = signal('all');
  readonly transactionPage = signal(1);
  readonly pageSize = TABLE_PAGE_SIZE;
  readonly filteredSupplierAccounts = computed(() => {
    const term = this.supplierSearch().trim().toLocaleLowerCase();
    const state = this.supplierBalanceFilter();
    return this.supplierAccounts().filter(account => {
      const balanceState = account.balance > 0 ? 'due' : account.balance < 0 ? 'credit' : 'settled';
      return (!term || account.supplier.toLocaleLowerCase().includes(term)) && (state === 'all' || state === balanceState);
    });
  });
  readonly visibleSupplierAccounts = computed(() => pageSlice(this.filteredSupplierAccounts(), this.supplierPage()));
  readonly filteredStatementInvoices = computed(() => {
    const statement = this.selectedSupplierStatement();
    const term = this.statementSearch().trim().toLocaleLowerCase();
    const from = this.statementFrom(); const to = this.statementTo();
    return (statement?.invoices ?? []).filter(invoice => {
      const date = invoice.createdAt.slice(0, 10);
      return (!term || invoice.supplierInvoice.toLocaleLowerCase().includes(term)) && (!from || date >= from) && (!to || date <= to);
    });
  });
  readonly visibleStatementInvoices = computed(() => pageSlice(this.filteredStatementInvoices(), this.statementPage()));
  readonly filteredPurchases = computed(() => {
    const term = this.purchaseSearch().trim().toLocaleLowerCase();
    const from = this.purchaseFrom(); const to = this.purchaseTo();
    return this.purchases().filter(purchase => {
      const date = purchase.createdAt.slice(0, 10);
      return (!term || [purchase.supplier, purchase.supplierInvoice].some(value => value.toLocaleLowerCase().includes(term))) &&
        (!from || date >= from) && (!to || date <= to);
    });
  });
  readonly visiblePurchases = computed(() => pageSlice(this.filteredPurchases(), this.purchasePage()));
  readonly filteredTransactions = computed(() => {
    const selected = this.selectedPurchase(); if (!selected) return [];
    const term = this.transactionSearch().trim().toLocaleLowerCase();
    const type = this.transactionType();
    return [
      ...selected.returns.map(item => ({ id: `r-${item.id}`, kind: 'Return', reference: item.supplierReference,
        description: item.reason, amount: item.total, date: item.createdAt, method: '' })),
      ...selected.payments.map(item => ({ id: `p-${item.id}`, kind: 'Payment', reference: item.reference ?? '',
        description: item.method, amount: item.amount, date: item.paidAt, method: item.method })),
    ].filter(item => (type === 'all' || item.kind.toLowerCase() === type) &&
      (!term || [item.kind, item.reference, item.description].some(value => value.toLocaleLowerCase().includes(term))))
      .sort((a, b) => b.date.localeCompare(a.date));
  });
  readonly visibleTransactions = computed(() => pageSlice(this.filteredTransactions(), this.transactionPage()));
  returnForm = { lineId: 0, quantity: 1, supplierReference: '', reason: '' };
  paymentForm = { amount: 0, method: 'Cash', reference: '' };
  readonly paymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet'];
  readonly today = new Date().toISOString().slice(0, 10);
  purchase = this.emptyForm(0);
  ngOnInit(): void {
    void this.perform(async () => {
      const [medicines, suppliers, purchases, supplierAccounts] = await Promise.all([
        this.medicinesApi.list(),
        this.suppliersApi.list(), this.api.list(), this.api.supplierAccounts(),
      ]);
      this.medicines.set(medicines);
      this.suppliers.set(suppliers);
      this.purchases.set(purchases);
      this.supplierAccounts.set(supplierAccounts);
    });
  }
  receivePurchase(): Promise<void> {
    return this.perform(async () => {
      const p = this.purchase;
      await this.api.receive({
        supplierId: +p.supplierId,
        supplierInvoice: p.supplierInvoice,
        lines: [
          {
            medicineId: +p.medicineId,
            batchNumber: p.batchNumber,
            expiryDate: p.expiryDate,
            quantity: +p.quantity,
            costPrice: +p.costPrice,
            salePrice: +p.salePrice,
          },
        ],
      });
      this.purchase = this.emptyForm(p.supplierId);
      this.supplierPickerSearch.set(this.suppliers().find(supplier => supplier.id === p.supplierId)?.name ?? '');
      await this.refreshFinancials();
      this.message.set('Purchase received; batch stock updated.');
    });
  }
  private async refreshPurchases(): Promise<void> { this.purchases.set(await this.api.list()); }
  private async refreshFinancials(): Promise<void> {
    const [purchases, accounts] = await Promise.all([this.api.list(), this.api.supplierAccounts()]);
    this.purchases.set(purchases);
    this.supplierAccounts.set(accounts);
    this.supplierPage.set(1); this.purchasePage.set(1);
    const statement = this.selectedSupplierStatement();
    if (statement) this.selectedSupplierStatement.set(await this.api.supplierStatement(statement.supplierId));
  }
  openSupplierStatement(account: SupplierAccountSummary): Promise<void> {
    this.statementSearch.set(''); this.statementFrom.set(''); this.statementTo.set(''); this.statementPage.set(1);
    return this.perform(async () => this.selectedSupplierStatement.set(await this.api.supplierStatement(account.supplierId)));
  }
  closeSupplierStatement(): void { this.selectedSupplierStatement.set(null); }
  downloadSupplierLedger(): void {
    const account = this.selectedSupplierStatement(); if (!account) return;
    const rows: (string | number | null | undefined)[][] = [];
    for (const invoice of account.invoices) {
      rows.push(['Invoice', invoice.supplierInvoice, invoice.createdAt, invoice.total, invoice.returnedTotal,
        invoice.paidTotal, this.balance(invoice), '', '', '', '']);
      for (const line of invoice.lines) rows.push(['Purchase line', invoice.supplierInvoice, invoice.createdAt,
        line.quantity * line.unitCost, '', '', '', line.medicine, line.batch, line.quantity, line.unitCost]);
      for (const item of invoice.returns) rows.push(['Return', invoice.supplierInvoice, item.createdAt,
        '', item.total, '', '', item.supplierReference, item.reason, '', '']);
      for (const payment of invoice.payments) rows.push(['Payment', invoice.supplierInvoice, payment.paidAt,
        '', '', payment.amount, '', payment.method, payment.reference, '', '']);
    }
    downloadCsv(`supplier-ledger-${safeFilename(account.supplier)}.csv`,
      ['Record type', 'Supplier invoice', 'Date', 'Purchase amount', 'Returned', 'Paid', 'Balance',
        'Item / method / reference', 'Batch / reason', 'Quantity', 'Unit cost'], rows);
  }
  openStatementInvoice(purchase: PurchaseHistory): void {
    this.selectedPurchase.set(purchase);
    this.transactionSearch.set(''); this.transactionType.set('all'); this.transactionPage.set(1);
    const eligible = purchase.lines.find(line => line.quantity > line.returnedQuantity && line.onHand > 0);
    this.returnForm = { lineId: eligible?.id ?? 0, quantity: 1, supplierReference: '', reason: '' };
    this.paymentForm = { amount: 0, method: 'Cash', reference: '' };
  }
  openReturn(purchase: PurchaseHistory): void {
    this.openStatementInvoice(purchase);
  }
  openPayment(purchase: PurchaseHistory): void { this.openReturn(purchase); this.paymentForm.amount = this.balance(purchase); }
  balance(purchase: PurchaseHistory): number { return Math.max(0, purchase.total - purchase.returnedTotal - purchase.paidTotal); }
  submitReturn(): Promise<void> {
    const purchase = this.selectedPurchase(); if (!purchase || !this.returnForm.lineId) return Promise.resolve();
    return this.perform(async () => {
      await this.api.returnStock(purchase.id, { supplierReference: this.returnForm.supplierReference, reason: this.returnForm.reason,
        lines: [{ purchaseLineId: +this.returnForm.lineId, quantity: +this.returnForm.quantity }] });
      this.selectedPurchase.set(null); await this.refreshFinancials(); this.message.set('Supplier return recorded and stock reduced.');
    });
  }
  submitPayment(): Promise<void> {
    const purchase = this.selectedPurchase(); if (!purchase) return Promise.resolve();
    return this.perform(async () => {
      await this.api.paySupplier(purchase.id, { ...this.paymentForm, amount: +this.paymentForm.amount });
      this.selectedPurchase.set(null); await this.refreshFinancials(); this.message.set('Supplier payment recorded.');
    });
  }
  private emptyForm(supplierId: number) {
    return {
      supplierId,
      supplierInvoice: '',
      medicineId: 0,
      batchNumber: '',
      expiryDate: '',
      quantity: 1,
      costPrice: 0,
      salePrice: 0,
    };
  }
  searchSuppliers(value: string): void {
    this.supplierPickerSearch.set(value);
    this.purchase.supplierId = 0;
  }
  selectSupplier(supplier: Supplier): void {
    this.purchase.supplierId = supplier.id;
    this.supplierPickerSearch.set(supplier.name);
  }
  clearSupplier(): void {
    this.purchase.supplierId = 0;
    this.supplierPickerSearch.set('');
  }
}
