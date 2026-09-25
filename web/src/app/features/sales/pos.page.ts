import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { MedicinesApi, Medicine } from '../medicines/public-api';
import { InventoryApi, Batch } from '../inventory/public-api';
import { SalesApi } from './sales.api';
import { Receipt } from './sales.models';
import { PosCartStore } from './pos-cart.store';
import { ReceiptComponent } from './receipt.component';
import { CustomersApi } from '../customers/public-api';

@Component({
  selector: 'app-pos-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent, ReceiptComponent],
  styleUrl: './pos.page.css',
  templateUrl: './pos.page.html',
})
export class PosPage extends PageFeedback implements OnInit {
  private readonly api = inject(SalesApi);
  private readonly medicinesApi = inject(MedicinesApi);
  private readonly inventoryApi = inject(InventoryApi);
  private readonly customersApi = inject(CustomersApi);
  readonly cart = inject(PosCartStore);
  readonly medicines = signal<Medicine[]>([]);
  readonly batches = signal<Batch[]>([]);
  readonly customers = signal<{ id: number; name: string }[]>([]);
  customerId: number | null = null;
  readonly receipt = signal<Receipt | null>(null);
  search = '';
  discountAmount = 0;
  paymentMethod = 'Cash';
  readonly paymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet', 'Not Received'];
  ngOnInit(): void {
    void this.perform(() => this.refreshInventory());
  }
  private async refreshInventory(): Promise<void> {
    const [medicines, batches, customers] = await Promise.all([
      this.medicinesApi.list(),
      this.inventoryApi.list(),
      this.customersApi.forPos(),
    ]);
    this.medicines.set(medicines);
    this.batches.set(batches);
    this.customers.set(customers);
  }
  get filteredMedicines(): Medicine[] {
    const query = this.search.trim().toLowerCase();
    return this.medicines()
      .filter(
        (m) =>
          m.isActive &&
          (m.name.toLowerCase().includes(query) || (m.barcode ?? '').toLowerCase().includes(query)),
      )
      .slice(0, 12);
  }
  addToCart(medicine: Medicine): void {
    const error = this.cart.add(medicine);
    this.message.set(error ?? '');
    this.hasError.set(!!error);
  }
  price(medicine: Medicine): number {
    const today = new Date().toISOString().slice(0, 10);
    return (
      this.batches()
        .filter((b) => b.medicineId === medicine.id && b.quantity > 0 && b.expiryDate >= today)
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.id - b.id)[0]?.salePrice ?? 0
    );
  }
  get estimate(): number {
    return this.cart.items().reduce((sum, row) => sum + row.quantity * this.price(row.medicine), 0);
  }
  get due(): number { return Math.max(0, this.estimate - Number(this.discountAmount || 0)); }
  get validCart(): boolean {
    return this.cart.items().every((row) => Number.isInteger(row.quantity) && row.quantity > 0);
  }
  completeSale(): Promise<void> {
    if (!this.validCart || this.cart.items().length === 0) return Promise.resolve();
    return this.perform(async () => {
      const result = await this.api.checkout({
        lines: this.cart
          .items()
          .map((row) => ({ medicineId: row.medicine.id, quantity: row.quantity })),
        cashReceived: +this.cart.cashReceived(),
        discountAmount: +this.discountAmount,
        paymentMethod: this.paymentMethod,
        customerId: this.customerId,
      });
      // A successful POST has already committed the sale. Clear the cart before loading its receipt.
      this.cart.clear();
      this.discountAmount = 0; this.paymentMethod = 'Cash';
      this.customerId = null;
      this.receipt.set(null);
      try {
        this.receipt.set(await this.api.receipt(result.id));
        await this.refreshInventory();
        this.message.set('Sale completed. Invoice is ready to print.');
      } catch {
        this.message.set(
          `Sale ${result.invoiceNumber} was saved. Open Sales history to reload the receipt.`,
        );
        this.hasError.set(true);
      }
    });
  }
}
