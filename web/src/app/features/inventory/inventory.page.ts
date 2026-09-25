import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { FormsModule } from '@angular/forms';
import { AuthSession } from '../authentication/public-api';

import { InventoryApi } from './inventory.api';
import { Batch, StockMovement } from './inventory.models';

@Component({
  selector: 'app-inventory-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent],
  templateUrl: './inventory.page.html',
  styleUrl: './inventory.page.css',
})
export class InventoryPage extends PageFeedback implements OnInit {
  private readonly pageSize = 20;
  private readonly api = inject(InventoryApi);
  readonly batches = signal<Batch[]>([]);
  readonly movements = signal<StockMovement[]>([]);
  readonly session = inject(AuthSession);
  readonly movementType = signal<'All' | 'Purchase' | 'Sale' | 'Adjustment'>('All');
  readonly movementFromDate = signal('');
  readonly movementToDate = signal('');
  readonly movementPage = signal(1);
  readonly filteredMovements = computed(() => {
    const type = this.movementType();
    const from = this.movementFromDate();
    const to = this.movementToDate();
    return this.movements().filter(movement => {
      const date = this.localDateKey(movement.createdAt);
      if (from && date < from) return false;
      if (to && date > to) return false;
      if (type === 'Purchase') return movement.type === 'Purchase' || movement.type === 'PurchaseReturn';
      if (type === 'Sale') return movement.type === 'Sale' || movement.type === 'SaleReturn' || movement.type === 'DamagedReturn';
      if (type === 'Adjustment') return movement.type === 'Adjustment' || movement.type === 'Damage';
      return true;
    });
  });
  readonly totalMovementPages = computed(() => Math.max(1, Math.ceil(this.filteredMovements().length / this.pageSize)));
  readonly visibleMovements = computed(() => {
    const start = (this.movementPage() - 1) * this.pageSize;
    return this.filteredMovements().slice(start, start + this.pageSize);
  });
  adjustment = { batchId: 0, quantity: 1, type: 'Damage' as 'Adjustment' | 'Damage', reason: '' };
  ngOnInit(): void {
    void this.perform(async () => this.refresh());
  }
  private async refresh(): Promise<void> {
    const [batches, movements] = await Promise.all([this.api.list(), this.api.movements()]);
    this.batches.set(batches); this.movements.set(movements);
    this.movementPage.set(1);
    if (!this.adjustment.batchId && batches.length) this.adjustment.batchId = batches[0].id;
  }
  resetMovementPage(): void { this.movementPage.set(1); }
  clearMovementFilters(): void {
    this.movementType.set('All'); this.movementFromDate.set(''); this.movementToDate.set('');
    this.movementPage.set(1);
  }
  previousMovementPage(): void { this.movementPage.update(page => Math.max(1, page - 1)); }
  nextMovementPage(): void { this.movementPage.update(page => Math.min(this.totalMovementPages(), page + 1)); }
  movementStart(): number { return this.filteredMovements().length ? (this.movementPage() - 1) * this.pageSize + 1 : 0; }
  movementEnd(): number { return Math.min(this.movementPage() * this.pageSize, this.filteredMovements().length); }
  submitAdjustment(): Promise<void> {
    return this.perform(async () => {
      const change = this.adjustment.type === 'Damage' ? -Math.abs(+this.adjustment.quantity) : +this.adjustment.quantity;
      await this.api.adjust({ batchId: +this.adjustment.batchId, quantityChange: change,
        reason: this.adjustment.reason, type: this.adjustment.type });
      this.adjustment.reason = ''; await this.refresh(); this.message.set('Stock movement recorded.');
    });
  }
  status(batch: Batch): string {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    if (batch.expiryDate < today) return 'Expired';
    if (batch.quantity === 0) return 'Out of stock';
    return batch.expiryDate <= cutoff.toISOString().slice(0, 10) ? 'Near expiry' : 'Available';
  }
  private localDateKey(value: string): string {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
