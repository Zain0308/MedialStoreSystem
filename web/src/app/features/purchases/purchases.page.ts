import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { RouterLink } from '@angular/router';
import { Medicine, MedicinesApi } from '../medicines/public-api';
import { Supplier, SuppliersApi } from '../suppliers/public-api';
import { PurchasesApi } from './purchases.api';

@Component({
  selector: 'app-purchases-page',
  imports: [CommonModule, FormsModule, RouterLink, PageNoticeComponent],
  templateUrl: './purchases.page.html',
})
export class PurchasesPage extends PageFeedback implements OnInit {
  private readonly api = inject(PurchasesApi);
  private readonly medicinesApi = inject(MedicinesApi);
  private readonly suppliersApi = inject(SuppliersApi);
  readonly medicines = signal<Medicine[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly today = new Date().toISOString().slice(0, 10);
  purchase = this.emptyForm(0);
  ngOnInit(): void {
    void this.perform(async () => {
      const [medicines, suppliers] = await Promise.all([
        this.medicinesApi.list(),
        this.suppliersApi.list(),
      ]);
      this.medicines.set(medicines);
      this.suppliers.set(suppliers);
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
      this.message.set('Purchase received; batch stock updated.');
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
