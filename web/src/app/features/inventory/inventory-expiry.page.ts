import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { pageSlice, TABLE_PAGE_SIZE, TablePaginationComponent } from '../../shared/ui/table-pagination.component';
import { ExpiryBatch } from './inventory.models';
import { InventoryApi } from './inventory.api';

type ExpiryFilter = 'soon' | 'expired' | 'all';

@Component({
  selector: 'app-inventory-expiry-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent, TablePaginationComponent],
  templateUrl: './inventory-expiry.page.html',
  styleUrl: './inventory-expiry.page.css',
})
export class InventoryExpiryPage extends PageFeedback implements OnInit {
  private readonly api = inject(InventoryApi);
  readonly batches = signal<ExpiryBatch[]>([]);
  readonly search = signal('');
  readonly filter = signal<ExpiryFilter>('soon');
  readonly expiryFrom = signal('');
  readonly expiryTo = signal('');
  readonly page = signal(1);
  readonly pageSize = TABLE_PAGE_SIZE;
  readonly upcomingCount = computed(() => this.batches().filter(batch => this.status(batch) === 'Expiring soon').length);
  readonly expiredCount = computed(() => this.batches().filter(batch => this.status(batch) === 'Expired').length);
  readonly filteredBatches = computed(() => {
    const term = this.search().trim().toLocaleLowerCase();
    const filter = this.filter();
    const from = this.expiryFrom();
    const to = this.expiryTo();
    return this.batches().filter(batch => {
      const status = this.status(batch);
      const matchesStatus = filter === 'all' || (filter === 'soon' && status === 'Expiring soon') ||
        (filter === 'expired' && status === 'Expired');
      const matchesSearch = !term || [batch.medicine, batch.batch, batch.supplier, batch.supplierInvoice]
        .some(value => value.toLocaleLowerCase().includes(term));
      return matchesStatus && matchesSearch && (!from || batch.expiryDate >= from) && (!to || batch.expiryDate <= to);
    });
  });
  readonly visibleBatches = computed(() => pageSlice(this.filteredBatches(), this.page()));

  ngOnInit(): void {
    void this.perform(async () => this.batches.set(await this.api.expiryBatches()));
  }

  status(batch: ExpiryBatch): 'Expired' | 'Expiring soon' | 'Upcoming' {
    const today = this.dateKey(new Date());
    if (batch.expiryDate <= today) return 'Expired';
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    return batch.expiryDate <= this.dateKey(cutoff) ? 'Expiring soon' : 'Upcoming';
  }

  daysRemaining(batch: ExpiryBatch): number {
    const parseDateKey = (dateKey: string): number => {
      const [year, month, day] = dateKey.split('-').map(Number);
      return Date.UTC(year, month - 1, day);
    };
    return Math.round((parseDateKey(batch.expiryDate) - parseDateKey(this.dateKey(new Date()))) / 86_400_000);
  }

  clearFilters(): void {
    this.search.set(''); this.filter.set('soon'); this.expiryFrom.set(''); this.expiryTo.set(''); this.page.set(1);
  }

  private dateKey(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
}
