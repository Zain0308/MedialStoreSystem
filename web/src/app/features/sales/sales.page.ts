import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { SalesApi } from './sales.api';
import { SaleSummary, Receipt } from './sales.models';
import { ReceiptComponent } from './receipt.component';

@Component({
  selector: 'app-sales-page',
  imports: [CommonModule, PageNoticeComponent, ReceiptComponent],
  templateUrl: './sales.page.html',
})
export class SalesPage extends PageFeedback implements OnInit {
  private readonly api = inject(SalesApi);
  readonly sales = signal<SaleSummary[]>([]);
  readonly receipt = signal<Receipt | null>(null);
  ngOnInit(): void {
    void this.perform(async () => this.sales.set(await this.api.list()));
  }
  viewReceipt(id: number): Promise<void> {
    return this.perform(async () => this.receipt.set(await this.api.receipt(id)));
  }
}
