import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { SalesApi } from './sales.api';
import { SaleSummary, Receipt } from './sales.models';
import { ReceiptComponent } from './receipt.component';
import { AuthSession } from '../authentication/public-api';
import { pageSlice, TABLE_PAGE_SIZE, TablePaginationComponent } from '../../shared/ui/table-pagination.component';
import { SearchPickerComponent, SearchPickerOption } from '../../shared/ui/search-picker.component';

@Component({
  selector: 'app-sales-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent, ReceiptComponent, TablePaginationComponent, SearchPickerComponent],
  templateUrl: './sales.page.html',
})
export class SalesPage extends PageFeedback implements OnInit {
  private readonly api = inject(SalesApi);
  readonly sales = signal<SaleSummary[]>([]);
  readonly search = signal('');
  readonly paymentFilter = signal('all');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly tablePage = signal(1);
  readonly pageSize = TABLE_PAGE_SIZE;
  readonly filteredSales = computed(() => {
    const term = this.search().trim().toLocaleLowerCase();
    const method = this.paymentFilter(); const from = this.fromDate(); const to = this.toDate();
    return this.sales().filter(sale => {
      const date = sale.createdAt.slice(0, 10);
      return (!term || [sale.invoiceNumber, sale.paymentMethod].some(value => value.toLocaleLowerCase().includes(term))) &&
        (method === 'all' || sale.paymentMethod === method) && (!from || date >= from) && (!to || date <= to);
    });
  });
  readonly visibleSales = computed(() => pageSlice(this.filteredSales(), this.tablePage()));
  readonly receipt = signal<Receipt | null>(null);
  readonly returnLineOptions = computed<SearchPickerOption[]>(() => (this.receipt()?.lines ?? [])
    .filter(line => line.quantity > line.returnedQuantity)
    .map(line => ({ value: line.saleLineId, label: line.medicine,
      detail: `${line.batch} · ${line.quantity - line.returnedQuantity} remaining`, searchText: line.batch })));
  readonly session = inject(AuthSession);
  readonly paymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet', 'Credit'];
  returnSaleId: number | null = null;
  returnForm = { saleLineId: 0, quantity: 1, restock: true, reason: '', refundMethod: 'Cash' };
  ngOnInit(): void {
    void this.perform(async () => { this.sales.set(await this.api.list()); this.tablePage.set(1); });
  }
  viewReceipt(id: number): Promise<void> {
    return this.perform(async () => this.loadReceipt(id));
  }
  returnQuantityMax(): number {
    const selected = this.receipt()?.lines.find(line => line.saleLineId === this.returnForm.saleLineId);
    return selected ? selected.quantity - selected.returnedQuantity : 0;
  }
  selectReturnLine(saleLineId: number | null): void {
    this.returnForm.saleLineId = saleLineId ?? 0;
    this.returnForm.quantity = 1;
  }
  private async loadReceipt(id: number): Promise<void> {
    this.returnSaleId = id;
    const receipt = await this.api.receipt(id); this.receipt.set(receipt);
    const line = receipt.lines.find(x => x.quantity > x.returnedQuantity);
    this.returnForm = { saleLineId: line?.saleLineId ?? 0, quantity: 1, restock: true, reason: '', refundMethod: 'Cash' };
  }
  submitReturn(): Promise<void> {
    const receipt = this.receipt(); if (!receipt || this.returnSaleId === null || !this.returnForm.saleLineId ||
      this.returnForm.quantity < 1 || this.returnForm.quantity > this.returnQuantityMax()) return Promise.resolve();
    return this.perform(async () => {
      const result = await this.api.returnSale(this.returnSaleId!, { reason: this.returnForm.reason,
        refundMethod: this.returnForm.refundMethod, lines: [{ saleLineId: +this.returnForm.saleLineId,
          quantity: +this.returnForm.quantity, restock: this.returnForm.restock }] });
      await Promise.all([this.refreshSales(), this.loadReceipt(this.returnSaleId!)]);
      this.message.set(`Return recorded. Refund: Rs ${result.totalRefund.toFixed(2)}.`);
    });
  }
  private async refreshSales(): Promise<void> { this.sales.set(await this.api.list()); }
}
