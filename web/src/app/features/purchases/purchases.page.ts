import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { RouterLink } from '@angular/router';
import { Medicine, MedicinesApi } from '../medicines/public-api';
import { Supplier, SuppliersApi } from '../suppliers/public-api';
import { PurchasesApi } from './purchases.api';
import { PurchaseHistory } from './purchases.models';
import { AuthSession } from '../authentication/public-api';

@Component({
  selector: 'app-purchases-page',
  imports: [CommonModule, FormsModule, RouterLink, PageNoticeComponent],
  templateUrl: './purchases.page.html',
})
export class PurchasesPage extends PageFeedback implements OnInit {
  private readonly api = inject(PurchasesApi);
  readonly session = inject(AuthSession);
  private readonly medicinesApi = inject(MedicinesApi);
  private readonly suppliersApi = inject(SuppliersApi);
  readonly medicines = signal<Medicine[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly purchases = signal<PurchaseHistory[]>([]);
  readonly selectedPurchase = signal<PurchaseHistory | null>(null);
  returnForm = { lineId: 0, quantity: 1, supplierReference: '', reason: '' };
  paymentForm = { amount: 0, method: 'Cash', reference: '' };
  readonly paymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Mobile Wallet'];
  readonly today = new Date().toISOString().slice(0, 10);
  purchase = this.emptyForm(0);
  ngOnInit(): void {
    void this.perform(async () => {
      const [medicines, suppliers, purchases] = await Promise.all([
        this.medicinesApi.list(),
        this.suppliersApi.list(), this.api.list(),
      ]);
      this.medicines.set(medicines);
      this.suppliers.set(suppliers);
      this.purchases.set(purchases);
    });
  }
  receivePurchase(): Promise<void> {
    return this.perform(async () => {
      const p = this.purchase;
      await this.api.receive({
        supplierId: +p.supplierId,
        supplierInvoice: p.supplierInvoice,
        lines: [
          {
            medicineId: +p.medicineId,
            batchNumber: p.batchNumber,
            expiryDate: p.expiryDate,
            quantity: +p.quantity,
            costPrice: +p.costPrice,
            salePrice: +p.salePrice,
          },
        ],
      });
      this.purchase = this.emptyForm(p.supplierId);
      await this.refreshPurchases();
      this.message.set('Purchase received; batch stock updated.');
    });
  }
  private async refreshPurchases(): Promise<void> { this.purchases.set(await this.api.list()); }
  openReturn(purchase: PurchaseHistory): void {
    this.selectedPurchase.set(purchase);
    const eligible = purchase.lines.find(x => x.quantity > x.returnedQuantity && x.onHand > 0);
    this.returnForm = { lineId: eligible?.id ?? 0, quantity: 1, supplierReference: '', reason: '' };
    this.paymentForm = { amount: 0, method: 'Cash', reference: '' };
  }
  openPayment(purchase: PurchaseHistory): void { this.openReturn(purchase); this.paymentForm.amount = this.balance(purchase); }
  balance(purchase: PurchaseHistory): number { return Math.max(0, purchase.total - purchase.returnedTotal - purchase.paidTotal); }
  submitReturn(): Promise<void> {
    const purchase = this.selectedPurchase(); if (!purchase || !this.returnForm.lineId) return Promise.resolve();
    return this.perform(async () => {
      await this.api.returnStock(purchase.id, { supplierReference: this.returnForm.supplierReference, reason: this.returnForm.reason,
        lines: [{ purchaseLineId: +this.returnForm.lineId, quantity: +this.returnForm.quantity }] });
      this.selectedPurchase.set(null); await this.refreshPurchases(); this.message.set('Supplier return recorded and stock reduced.');
    });
  }
  submitPayment(): Promise<void> {
    const purchase = this.selectedPurchase(); if (!purchase) return Promise.resolve();
    return this.perform(async () => {
      await this.api.paySupplier(purchase.id, { ...this.paymentForm, amount: +this.paymentForm.amount });
      this.selectedPurchase.set(null); await this.refreshPurchases(); this.message.set('Supplier payment recorded.');
    });
  }
  private emptyForm(supplierId: number) {
    return {
      supplierId,
      supplierInvoice: '',
      medicineId: 0,
      batchNumber: '',
      expiryDate: '',
      quantity: 1,
      costPrice: 0,
      salePrice: 0,
    };
  }
}
