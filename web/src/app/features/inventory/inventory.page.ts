import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { InventoryApi } from './inventory.api';
import { Batch } from './inventory.models';

@Component({
  selector: 'app-inventory-page',
  imports: [CommonModule, PageNoticeComponent],
  templateUrl: './inventory.page.html',
})
export class InventoryPage extends PageFeedback implements OnInit {
  private readonly api = inject(InventoryApi);
  readonly batches = signal<Batch[]>([]);
  ngOnInit(): void {
    void this.perform(async () => this.batches.set(await this.api.list()));
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
