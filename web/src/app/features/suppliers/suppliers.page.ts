import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { SuppliersApi } from './suppliers.api';
import { Supplier, CreateSupplier } from './suppliers.models';
import { AuthSession } from '../authentication/public-api';
import { PurchasesApi, SupplierStatement } from '../purchases/public-api';
import { pageSlice, TABLE_PAGE_SIZE, TablePaginationComponent } from '../../shared/ui/table-pagination.component';
import { downloadCsv, safeFilename } from '../../shared/utils/csv-download';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';

@Component({
  selector: 'app-suppliers-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent, TablePaginationComponent, ConfirmDialogComponent],
  styleUrl: './suppliers.page.css',
  templateUrl: './suppliers.page.html',
})
export class SuppliersPage extends PageFeedback implements OnInit {
  private readonly api = inject(SuppliersApi);
  private readonly purchasesApi = inject(PurchasesApi);
  readonly session = inject(AuthSession);
  readonly suppliers = signal<Supplier[]>([]);
  readonly searchText = signal('');
  readonly statusFilter = signal('all');
  readonly tablePage = signal(1);
  readonly ledgerSearch = signal('');
  readonly ledgerFrom = signal('');
  readonly ledgerTo = signal('');
  readonly ledgerPage = signal(1);
  readonly pageSize = TABLE_PAGE_SIZE;
  readonly editingId = signal<number | null>(null);
  readonly statement = signal<SupplierStatement | null>(null);
  readonly pendingStatusChange = signal<Supplier | null>(null);
  readonly visibleSuppliers = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    return this.suppliers().filter(supplier => (this.statusFilter() === 'all' || (this.statusFilter() === 'active') === supplier.isActive) &&
      (!query || [supplier.name, supplier.phone, supplier.contactPerson, supplier.email, supplier.address]
        .some(value => value?.toLocaleLowerCase().includes(query))));
  });
  readonly pagedSuppliers = computed(() => pageSlice(this.visibleSuppliers(), this.tablePage()));
  readonly filteredLedgerInvoices = computed(() => {
    const statement = this.statement();
    const term = this.ledgerSearch().trim().toLocaleLowerCase();
    const from = this.ledgerFrom(); const to = this.ledgerTo();
    return (statement?.invoices ?? []).filter(invoice => {
      const date = invoice.createdAt.slice(0, 10);
      return (!term || invoice.supplierInvoice.toLocaleLowerCase().includes(term)) && (!from || date >= from) && (!to || date <= to);
    });
  });
  readonly pagedLedgerInvoices = computed(() => pageSlice(this.filteredLedgerInvoices(), this.ledgerPage()));
  supplierForm: CreateSupplier = this.emptyForm();
  ngOnInit(): void {
    void this.perform(async () => this.suppliers.set(await this.api.list()));
  }
  saveSupplier(): Promise<void> {
    return this.perform(async () => {
      const id = this.editingId();
      if (id === null) await this.api.create(this.supplierForm);
      else await this.api.update(id, this.supplierForm);
      this.supplierForm = this.emptyForm();
      this.editingId.set(null);
      this.suppliers.set(await this.api.list());
      this.message.set(id === null ? 'Supplier added.' : 'Supplier details updated.');
    });
  }
  editSupplier(supplier: Supplier): void {
    this.editingId.set(supplier.id);
    this.supplierForm = {
      name: supplier.name, phone: supplier.phone ?? '', contactPerson: supplier.contactPerson ?? '',
      email: supplier.email ?? '', address: supplier.address ?? '',
    };
  }
  cancelEdit(): void { this.editingId.set(null); this.supplierForm = this.emptyForm(); }
  setActive(supplier: Supplier): void { this.pendingStatusChange.set(supplier); }
  confirmStatusChange(): Promise<void> {
    const supplier = this.pendingStatusChange();
    if (!supplier) return Promise.resolve();
    return this.perform(async () => {
      await this.api.setActive(supplier.id, !supplier.isActive);
      this.suppliers.set(await this.api.list());
      this.message.set(supplier.isActive ? 'Supplier deactivated.' : 'Supplier activated.');
      this.pendingStatusChange.set(null);
    });
  }
  openLedger(supplier: Supplier): Promise<void> {
    this.ledgerPage.set(1); this.ledgerSearch.set(''); this.ledgerFrom.set(''); this.ledgerTo.set('');
    return this.perform(async () => this.statement.set(await this.purchasesApi.supplierStatement(supplier.id)));
  }
  closeLedger(): void { this.statement.set(null); }
  downloadLedger(): void {
    const account = this.statement(); if (!account) return;
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
  balance(invoice: { total: number; returnedTotal: number; paidTotal: number }): number {
    return Math.max(0, invoice.total - invoice.returnedTotal - invoice.paidTotal);
  }
  clearSearch(): void { this.searchText.set(''); this.tablePage.set(1); }
  private emptyForm(): CreateSupplier { return { name: '', phone: '', contactPerson: '', email: '', address: '' }; }
}
