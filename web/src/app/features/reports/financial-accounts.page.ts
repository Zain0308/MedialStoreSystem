import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { TablePaginationComponent } from '../../shared/ui/table-pagination.component';
import { ReportsApi } from './reports.api';
import { DetailedReport, PayablesReport, ReceivablesReport } from './reports.models';
import { pageSlice, TABLE_PAGE_SIZE } from '../../shared/ui/table-pagination.component';
import { downloadCsv, safeFilename } from '../../shared/utils/csv-download';

type FinancialTab = 'profit-loss' | 'payables' | 'receivables';
const currentMonth = new Date().toISOString().slice(0, 7);
const monthDates = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10) };
};

@Component({
  selector: 'app-financial-accounts-page',
  imports: [CommonModule, FormsModule, RouterLink, PageNoticeComponent, TablePaginationComponent],
  styleUrl: './reports.page.css',
  templateUrl: './financial-accounts.page.html',
})
export class FinancialAccountsPage extends PageFeedback implements OnInit {
  private readonly api = inject(ReportsApi);
  private readonly route = inject(ActivatedRoute);
  readonly activeFinancialTab = signal<FinancialTab>('profit-loss');
  readonly detail = signal<DetailedReport | null>(null);
  readonly payables = signal<PayablesReport | null>(null);
  readonly receivables = signal<ReceivablesReport | null>(null);
  readonly pageSize = TABLE_PAGE_SIZE;
  readonly salesSearch = signal(''); readonly salesMethod = signal('all'); readonly salesPage = signal(1);
  readonly expenseSearch = signal(''); readonly expenseCategory = signal('all'); readonly expensePage = signal(1);
  readonly inventorySearch = signal(''); readonly expiryFrom = signal(''); readonly expiryTo = signal(''); readonly inventoryPage = signal(1);
  readonly supplierSearch = signal(''); readonly supplierBalance = signal('all'); readonly supplierPage = signal(1);
  readonly customerSearch = signal(''); readonly customerBalance = signal('due'); readonly customerPage = signal(1);
  readonly supplierInvoiceSearch = signal<Record<number, string>>({});
  readonly supplierInvoiceFrom = signal<Record<number, string>>({});
  readonly supplierInvoiceTo = signal<Record<number, string>>({});
  readonly supplierInvoicePage = signal<Record<number, number>>({});
  readonly customerInvoiceSearch = signal<Record<number, string>>({});
  readonly customerInvoiceFrom = signal<Record<number, string>>({});
  readonly customerInvoiceTo = signal<Record<number, string>>({});
  readonly customerInvoicePage = signal<Record<number, number>>({});
  readonly filteredSales = computed(() => {
    const rows = this.detail()?.sales ?? []; const term = this.salesSearch().trim().toLocaleLowerCase(); const method = this.salesMethod();
    return rows.filter(row => (method === 'all' || row.paymentMethod === method) &&
      (!term || [row.invoiceNumber, row.customer ?? '', row.paymentMethod].some(value => value.toLocaleLowerCase().includes(term))));
  });
  readonly visibleSales = computed(() => pageSlice(this.filteredSales(), this.salesPage()));
  readonly filteredExpenses = computed(() => {
    const rows = this.detail()?.expenses ?? []; const term = this.expenseSearch().trim().toLocaleLowerCase(); const category = this.expenseCategory();
    return rows.filter(row => (category === 'all' || row.category === category) &&
      (!term || [row.category, row.description, row.paymentMethod, row.reference ?? ''].some(value => value.toLocaleLowerCase().includes(term))));
  });
  readonly visibleExpenses = computed(() => pageSlice(this.filteredExpenses(), this.expensePage()));
  readonly expenseCategories = computed(() => [...new Set((this.detail()?.expenses ?? []).map(row => row.category))].sort());
  readonly filteredInventory = computed(() => {
    const rows = this.detail()?.inventory ?? []; const term = this.inventorySearch().trim().toLocaleLowerCase();
    const from = this.expiryFrom(); const to = this.expiryTo();
    return rows.filter(row => (!term || [row.medicine, row.batch].some(value => value.toLocaleLowerCase().includes(term))) &&
      (!from || row.expiryDate >= from) && (!to || row.expiryDate <= to));
  });
  readonly visibleInventory = computed(() => pageSlice(this.filteredInventory(), this.inventoryPage()));
  readonly filteredSuppliers = computed(() => {
    const rows = this.payables()?.suppliers ?? []; const term = this.supplierSearch().trim().toLocaleLowerCase(); const balance = this.supplierBalance();
    return rows.filter(row => (balance === 'all' || (balance === 'payable' && row.payableAmount > 0) ||
      (balance === 'credit' && row.receivableAmount > 0) || (balance === 'settled' && row.balance === 0)) &&
      (!term || row.supplier.toLocaleLowerCase().includes(term)));
  });
  readonly visibleSuppliers = computed(() => pageSlice(this.filteredSuppliers(), this.supplierPage()));
  readonly filteredCustomers = computed(() => {
    const rows = this.receivables()?.customers ?? []; const term = this.customerSearch().trim().toLocaleLowerCase(); const balance = this.customerBalance();
    return rows.filter(row => (balance === 'all' || (balance === 'due' && row.amountDue > 0) || (balance === 'settled' && row.amountDue === 0)) &&
      (!term || [row.customer, row.phone ?? '', row.email ?? ''].some(value => value.toLocaleLowerCase().includes(term))));
  });
  readonly visibleCustomers = computed(() => pageSlice(this.filteredCustomers(), this.customerPage()));
  month = currentMonth;
  fromDate = monthDates(currentMonth).from;
  toDate = monthDates(currentMonth).to;

  ngOnInit(): void {
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (requestedTab === 'payables' || requestedTab === 'receivables') this.activeFinancialTab.set(requestedTab);
    void this.perform(async () => this.detail.set(await this.api.details(this.fromDate, this.toDate)));
    this.loadActiveTab();
  }

  selectFinancialTab(tab: FinancialTab): void {
    this.activeFinancialTab.set(tab);
    this.loadActiveTab();
  }

  private loadActiveTab(): void {
    if (this.activeFinancialTab() === 'payables' && this.payables() === null)
      void this.perform(async () => this.payables.set(await this.api.payables()));
    if (this.activeFinancialTab() === 'receivables' && this.receivables() === null)
      void this.perform(async () => this.receivables.set(await this.api.receivables()));
  }

  setProfitLossMonth(month: string): Promise<void> {
    if (!month) return Promise.resolve();
    this.month = month;
    const dates = monthDates(month);
    this.fromDate = dates.from;
    this.toDate = dates.to;
    this.salesPage.set(1); this.expensePage.set(1); this.inventoryPage.set(1);
    return this.loadDetails();
  }

  customersWithOutstandingBalance(): number {
    return this.receivables()?.customers.filter(customer => customer.amountDue > 0).length ?? 0;
  }

  loadDetails(): Promise<void> { return this.perform(async () => { this.detail.set(await this.api.details(this.fromDate, this.toDate)); this.salesPage.set(1); this.expensePage.set(1); this.inventoryPage.set(1); }); }

  supplierInvoices(supplierId: number) {
    const supplier = this.payables()?.suppliers.find(row => row.supplierId === supplierId);
    const term = (this.supplierInvoiceSearch()[supplierId] ?? '').trim().toLocaleLowerCase();
    const from = this.supplierInvoiceFrom()[supplierId] ?? ''; const to = this.supplierInvoiceTo()[supplierId] ?? '';
    const rows = (supplier?.invoices ?? []).filter(row => {
      const date = row.createdAt.slice(0, 10);
      return (!term || row.supplierInvoice.toLocaleLowerCase().includes(term)) && (!from || date >= from) && (!to || date <= to);
    });
    return pageSlice(rows, this.supplierInvoicePage()[supplierId] ?? 1);
  }
  supplierInvoiceCount(supplierId: number): number {
    const supplier = this.payables()?.suppliers.find(row => row.supplierId === supplierId);
    const term = (this.supplierInvoiceSearch()[supplierId] ?? '').trim().toLocaleLowerCase();
    const from = this.supplierInvoiceFrom()[supplierId] ?? ''; const to = this.supplierInvoiceTo()[supplierId] ?? '';
    return (supplier?.invoices ?? []).filter(row => {
      const date = row.createdAt.slice(0, 10);
      return (!term || row.supplierInvoice.toLocaleLowerCase().includes(term)) && (!from || date >= from) && (!to || date <= to);
    }).length;
  }
  setSupplierInvoiceFilter(id: number, field: 'search' | 'from' | 'to', value: string): void {
    const target = field === 'search' ? this.supplierInvoiceSearch : field === 'from' ? this.supplierInvoiceFrom : this.supplierInvoiceTo;
    target.update(current => ({ ...current, [id]: value }));
    this.supplierInvoicePage.update(current => ({ ...current, [id]: 1 }));
  }
  setSupplierInvoicePage(id: number, page: number): void { this.supplierInvoicePage.update(current => ({ ...current, [id]: page })); }

  customerInvoices(customerId: number) {
    const customer = this.receivables()?.customers.find(row => row.customerId === customerId);
    const term = (this.customerInvoiceSearch()[customerId] ?? '').trim().toLocaleLowerCase();
    const from = this.customerInvoiceFrom()[customerId] ?? ''; const to = this.customerInvoiceTo()[customerId] ?? '';
    const rows = (customer?.invoices ?? []).filter(row => {
      const date = row.createdAt.slice(0, 10);
      return (!term || row.invoiceNumber.toLocaleLowerCase().includes(term)) && (!from || date >= from) && (!to || date <= to);
    });
    return pageSlice(rows, this.customerInvoicePage()[customerId] ?? 1);
  }
  customerInvoiceCount(customerId: number): number {
    const customer = this.receivables()?.customers.find(row => row.customerId === customerId);
    const term = (this.customerInvoiceSearch()[customerId] ?? '').trim().toLocaleLowerCase();
    const from = this.customerInvoiceFrom()[customerId] ?? ''; const to = this.customerInvoiceTo()[customerId] ?? '';
    return (customer?.invoices ?? []).filter(row => {
      const date = row.createdAt.slice(0, 10);
      return (!term || row.invoiceNumber.toLocaleLowerCase().includes(term)) && (!from || date >= from) && (!to || date <= to);
    }).length;
  }
  setCustomerInvoiceFilter(id: number, field: 'search' | 'from' | 'to', value: string): void {
    const target = field === 'search' ? this.customerInvoiceSearch : field === 'from' ? this.customerInvoiceFrom : this.customerInvoiceTo;
    target.update(current => ({ ...current, [id]: value }));
    this.customerInvoicePage.update(current => ({ ...current, [id]: 1 }));
  }
  setCustomerInvoicePage(id: number, page: number): void { this.customerInvoicePage.update(current => ({ ...current, [id]: page })); }

  downloadSupplierLedger(supplierId: number): void {
    const supplier = this.payables()?.suppliers.find(row => row.supplierId === supplierId); if (!supplier) return;
    const rows: (string | number | null | undefined)[][] = [];
    for (const invoice of supplier.invoices) {
      rows.push(['Invoice', invoice.supplierInvoice, invoice.createdAt, invoice.total, invoice.returned,
        invoice.paid, invoice.balance, '', '', '']);
      for (const item of invoice.returns) rows.push(['Return', invoice.supplierInvoice, item.createdAt,
        '', item.amount, '', '', item.supplierReference, item.reason, '']);
      for (const payment of invoice.payments) rows.push(['Payment', invoice.supplierInvoice, payment.paidAt,
        '', '', payment.amount, '', payment.method, payment.reference, '']);
    }
    downloadCsv(`supplier-ledger-${safeFilename(supplier.supplier)}.csv`,
      ['Record type', 'Supplier invoice', 'Date', 'Purchase amount', 'Returned', 'Paid', 'Balance', 'Method / reference', 'Return reason', 'Notes'], rows);
  }

  downloadCustomerLedger(customerId: number): void {
    const customer = this.receivables()?.customers.find(row => row.customerId === customerId); if (!customer) return;
    const rows: (string | number | null | undefined)[][] = [
      ['Account summary', '', '', '', '', customer.paidTotal, customer.amountDue],
    ];
    for (const invoice of customer.invoices) {
      rows.push(['Invoice', invoice.invoiceNumber, invoice.createdAt, invoice.total, invoice.returned, invoice.paid, invoice.due]);
      for (const payment of invoice.payments) rows.push([
        'Payment', invoice.invoiceNumber, payment.paidAt, '', '', payment.amount, '', payment.method, payment.reference,
      ]);
    }
    downloadCsv(`customer-ledger-${safeFilename(customer.customer)}.csv`,
      ['Record type', 'Invoice', 'Date', 'Sale total', 'Returned', 'Paid total', 'Due', 'Payment method', 'Payment reference'], rows);
  }

  download(type: string): Promise<void> {
    return this.perform(async () => {
      const blob = await this.api.export(type, this.fromDate, this.toDate);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}-report-${this.fromDate}-to-${this.toDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }
}
