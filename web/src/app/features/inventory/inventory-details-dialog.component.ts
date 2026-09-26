import { CommonModule } from '@angular/common';
import { Component, computed, EventEmitter, Input, OnChanges, Output, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pageSlice, TABLE_PAGE_SIZE, TablePaginationComponent } from '../../shared/ui/table-pagination.component';
import { InventoryMedicineDetails } from './inventory.models';

@Component({
  selector: 'app-inventory-details-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, TablePaginationComponent],
  templateUrl: './inventory-details-dialog.component.html',
  styleUrl: './inventory-details-dialog.component.css',
})
export class InventoryDetailsDialogComponent implements OnChanges {
  @Input() productName = '';
  @Input() details: InventoryMedicineDetails | null = null;
  @Input() loading = false;
  @Output() closed = new EventEmitter<void>();
  readonly activeTab = signal<'purchases' | 'payments' | 'returns' | 'corrections'>('purchases');
  readonly historySearch = signal('');
  readonly historyFrom = signal('');
  readonly historyTo = signal('');
  readonly historyPage = signal(1);
  readonly pageSize = TABLE_PAGE_SIZE;
  private readonly detailsVersion = signal(0);
  readonly filteredPurchases = computed(() => {
    this.detailsVersion();
    const term = this.historySearch().trim().toLocaleLowerCase();
    const from = this.historyFrom(); const to = this.historyTo();
    return this.filterRows(this.details?.purchases ?? [], term, from, to,
      row => row.purchasedAt, [row => row.supplier, row => row.supplierInvoice, row => row.batch]);
  });
  readonly visiblePurchases = computed(() => pageSlice(this.filteredPurchases(), this.historyPage()));
  readonly filteredPayments = computed(() => {
    this.detailsVersion();
    const term = this.historySearch().trim().toLocaleLowerCase();
    const from = this.historyFrom(); const to = this.historyTo();
    return this.filterRows(this.details?.payments ?? [], term, from, to,
      row => row.paidAt, [row => row.supplier, row => row.supplierInvoice, row => row.method, row => row.reference ?? '']);
  });
  readonly visiblePayments = computed(() => pageSlice(this.filteredPayments(), this.historyPage()));
  readonly filteredReturns = computed(() => {
    this.detailsVersion();
    const term = this.historySearch().trim().toLocaleLowerCase();
    const from = this.historyFrom(); const to = this.historyTo();
    return this.filterRows(this.details?.returns ?? [], term, from, to,
      row => row.createdAt, [row => row.supplier, row => row.supplierInvoice, row => row.supplierReference, row => row.reason]);
  });
  readonly visibleReturns = computed(() => pageSlice(this.filteredReturns(), this.historyPage()));
  readonly filteredCorrections = computed(() => {
    this.detailsVersion();
    const term = this.historySearch().trim().toLocaleLowerCase();
    const from = this.historyFrom(); const to = this.historyTo();
    return this.filterRows(this.details?.corrections ?? [], term, from, to,
      row => row.createdAt, [row => row.supplierInvoice, row => row.batch, row => row.reason]);
  });
  readonly visibleCorrections = computed(() => pageSlice(this.filteredCorrections(), this.historyPage()));

  ngOnChanges(_changes: SimpleChanges): void { this.detailsVersion.update(version => version + 1); }

  selectTab(tab: 'purchases' | 'payments' | 'returns' | 'corrections'): void {
    this.activeTab.set(tab); this.clearFilters();
  }

  clearFilters(): void {
    this.historySearch.set(''); this.historyFrom.set(''); this.historyTo.set(''); this.historyPage.set(1);
  }

  stockTotal(details: InventoryMedicineDetails): number {
    return details.batches.reduce((total, batch) => total + batch.quantity, 0);
  }

  invoiceDue(purchase: InventoryMedicineDetails['purchases'][number]): number {
    return purchase.invoiceTotal - purchase.invoicePaid - purchase.invoiceReturned;
  }

  private filterRows<T>(rows: T[], term: string, from: string, to: string,
    getDate: (row: T) => string, getSearchValues: ((row: T) => string)[]): T[] {
    return rows.filter(row => {
      const date = getDate(row).slice(0, 10);
      return (!from || date >= from) && (!to || date <= to) &&
        (!term || getSearchValues.some(getValue => getValue(row).toLocaleLowerCase().includes(term)));
    });
  }
}
