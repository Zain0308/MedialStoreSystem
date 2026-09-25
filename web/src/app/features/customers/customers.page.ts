import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { AuthSession } from '../authentication/public-api';
import { pageSlice, TABLE_PAGE_SIZE, TablePaginationComponent } from '../../shared/ui/table-pagination.component';
import { CustomersApi } from './customers.api';
import { Customer, CustomerLedger, SaveCustomer } from './customers.models';
import { SalesApi } from '../sales/sales.api';
import { Receipt } from '../sales/sales.models';
import { ReceiptComponent } from '../sales/receipt.component';
import { downloadCsv, safeFilename } from '../../shared/utils/csv-download';
import { SearchPickerComponent, SearchPickerOption } from '../../shared/ui/search-picker.component';

@Component({ selector: 'app-customers-page', imports: [CommonModule, FormsModule, PageNoticeComponent, TablePaginationComponent, ReceiptComponent, SearchPickerComponent],
  styleUrl: './customers.page.css', templateUrl: './customers.page.html' })
export class CustomersPage extends PageFeedback implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly salesApi = inject(SalesApi);
  readonly session = inject(AuthSession);
  readonly customers = signal<Customer[]>([]);
  readonly search = signal('');
  readonly statusFilter = signal('all');
  readonly tablePage = signal(1);
  readonly ledgerPage = signal(1);
  readonly pageSize = TABLE_PAGE_SIZE;
  readonly ledger = signal<CustomerLedger | null>(null);
  readonly receipt = signal<Receipt | null>(null);
  readonly receiptSaleId = signal<number | null>(null);
  readonly returnLineOptions = computed<SearchPickerOption[]>(() => (this.receipt()?.lines ?? [])
    .filter(line => line.quantity > line.returnedQuantity)
    .map(line => ({ value: line.saleLineId, label: line.medicine,
      detail: `${line.batch} · ${line.quantity - line.returnedQuantity} remaining`, searchText: line.batch })));
  readonly editingId = signal<number | null>(null);
  readonly visibleCustomers = computed(() => {
    const term = this.search().trim().toLocaleLowerCase();
    return this.customers().filter(x => (this.statusFilter() === 'all' || (this.statusFilter() === 'active') === x.isActive) &&
      (!term || [x.name, x.phone, x.email].some(v => v?.toLocaleLowerCase().includes(term))));
  });
  readonly pagedCustomers = computed(() => pageSlice(this.visibleCustomers(), this.tablePage()));
  readonly visibleLedgerInvoices = computed(() => pageSlice(this.ledger()?.invoices ?? [], this.ledgerPage()));
  form: SaveCustomer = this.emptyForm();
  payment = { invoiceId: 0, amount: 0, method: 'Cash', reference: '' };
  readonly methods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet'];
  returnForm = { saleLineId: 0, quantity: 1, restock: true, reason: '', refundMethod: 'Cash' };
  ngOnInit(): void { void this.perform(async () => this.customers.set(await this.api.list())); }
  save(): Promise<void> {
    return this.perform(async () => {
      const id = this.editingId();
      if (id === null) await this.api.create(this.form); else await this.api.update(id, this.form);
      this.form = this.emptyForm(); this.editingId.set(null); await this.refresh();
      this.message.set(id === null ? 'Customer added.' : 'Customer details updated.');
    });
  }
  edit(customer: Customer): void {
    this.editingId.set(customer.id);
    this.form = { name: customer.name, phone: customer.phone ?? '', email: customer.email ?? '' };
  }
  cancelEdit(): void { this.editingId.set(null); this.form = this.emptyForm(); }
  setActive(customer: Customer): Promise<void> {
    return this.perform(async () => { await this.api.setActive(customer.id, !customer.isActive); await this.refresh();
      this.message.set(customer.isActive ? 'Customer deactivated.' : 'Customer activated.'); });
  }
  openLedger(customer: Customer): Promise<void> { this.ledgerPage.set(1); return this.perform(async () => this.ledger.set(await this.api.ledger(customer.id))); }
  closeLedger(): void { this.ledger.set(null); this.ledgerPage.set(1); }
  downloadLedger(): void {
    const account = this.ledger(); if (!account) return;
    const rows: (string | number | null | undefined)[][] = [
      ['Account summary', '', '', '', '', account.paidTotal, account.receivable],
    ];
    for (const invoice of account.invoices) {
      rows.push(['Invoice', invoice.invoiceNumber, invoice.createdAt, invoice.total, invoice.returned, invoice.paid, this.due(invoice)]);
      for (const payment of invoice.payments) rows.push([
        'Payment', invoice.invoiceNumber, payment.paidAt, '', '', payment.amount, '', payment.method, payment.reference,
      ]);
    }
    downloadCsv(`customer-ledger-${safeFilename(account.customer.name)}.csv`,
      ['Record type', 'Invoice', 'Date', 'Sale total', 'Returned', 'Paid total', 'Due', 'Payment method', 'Payment reference'], rows);
  }
  viewReceipt(saleId: number): Promise<void> {
    return this.perform(async () => {
      const receipt = await this.salesApi.receipt(saleId);
      this.receiptSaleId.set(saleId); this.receipt.set(receipt);
      this.returnForm = { saleLineId: receipt.lines.find(line => line.quantity > line.returnedQuantity)?.saleLineId ?? 0,
        quantity: 1, restock: true, reason: '', refundMethod: 'Cash' };
    });
  }
  closeReceipt(): void { this.receipt.set(null); this.receiptSaleId.set(null); }
  returnQuantityMax(): number {
    const selected = this.receipt()?.lines.find(line => line.saleLineId === this.returnForm.saleLineId);
    return selected ? selected.quantity - selected.returnedQuantity : 0;
  }
  selectReturnLine(saleLineId: number | null): void {
    this.returnForm.saleLineId = saleLineId ?? 0;
    this.returnForm.quantity = 1;
  }
  submitReturn(): Promise<void> {
    const ledger = this.ledger(); const receipt = this.receipt(); const saleId = this.receiptSaleId();
    if (!ledger || !receipt || saleId === null || !this.returnForm.saleLineId || !this.returnForm.reason.trim() ||
      this.returnForm.quantity < 1 || this.returnForm.quantity > this.returnQuantityMax()) return Promise.resolve();
    return this.perform(async () => {
      const result = await this.salesApi.returnSale(saleId, { reason: this.returnForm.reason,
        refundMethod: this.returnForm.refundMethod, lines: [{ saleLineId: this.returnForm.saleLineId,
          quantity: +this.returnForm.quantity, restock: this.returnForm.restock }] });
      this.ledger.set(await this.api.ledger(ledger.customer.id)); await this.refresh();
      const updatedReceipt = await this.salesApi.receipt(saleId); this.receipt.set(updatedReceipt);
      this.returnForm = { saleLineId: updatedReceipt.lines.find(line => line.quantity > line.returnedQuantity)?.saleLineId ?? 0,
        quantity: 1, restock: true, reason: '', refundMethod: 'Cash' };
      this.message.set(`Customer return recorded. Refund: Rs ${result.totalRefund.toFixed(2)}.`);
    });
  }
  startPayment(invoiceId: number, due: number): void { this.payment = { invoiceId, amount: due, method: 'Cash', reference: '' }; }
  recordPayment(): Promise<void> {
    const ledger = this.ledger(); if (!ledger || this.payment.invoiceId === 0) return Promise.resolve();
    return this.perform(async () => {
      await this.api.payment(ledger.customer.id, { saleId: this.payment.invoiceId, amount: +this.payment.amount,
        method: this.payment.method, reference: this.payment.reference });
      this.ledger.set(await this.api.ledger(ledger.customer.id)); await this.refresh(); this.payment.invoiceId = 0;
      this.message.set('Customer payment recorded.');
    });
  }
  due(invoice: { total: number; returned: number; paid: number }): number { return Math.max(0, invoice.total - invoice.returned - invoice.paid); }
  private async refresh(): Promise<void> { this.customers.set(await this.api.list()); }
  private emptyForm(): SaveCustomer { return { name: '', phone: '', email: '' }; }
}
