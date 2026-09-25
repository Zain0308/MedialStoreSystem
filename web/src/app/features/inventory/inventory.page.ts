import { Component, inject, OnInit, signal } from '@angular/core';
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
})
export class InventoryPage extends PageFeedback implements OnInit {
  private readonly api = inject(InventoryApi);
  readonly batches = signal<Batch[]>([]);
  readonly movements = signal<StockMovement[]>([]);
  readonly session = inject(AuthSession);
  adjustment = { batchId: 0, quantity: 1, type: 'Damage' as 'Adjustment' | 'Damage', reason: '' };
  ngOnInit(): void {
    void this.perform(async () => this.refresh());
  }
  private async refresh(): Promise<void> {
    const [batches, movements] = await Promise.all([this.api.list(), this.api.movements()]);
    this.batches.set(batches); this.movements.set(movements);
    if (!this.adjustment.batchId && batches.length) this.adjustment.batchId = batches[0].id;
  }
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
}
