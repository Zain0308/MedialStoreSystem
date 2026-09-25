import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { CreatePurchase, PurchaseHistory, PurchaseResult, SupplierAccountSummary, SupplierStatement } from './purchases.models';

@Injectable({ providedIn: 'root' })
export class PurchasesApi {
  private readonly api = inject(ApiClient);
  receive(input: CreatePurchase) {
    return this.api.post<PurchaseResult>('/purchases', input);
  }
  list() { return this.api.get<PurchaseHistory[]>('/purchases'); }
  supplierAccounts() { return this.api.get<SupplierAccountSummary[]>('/purchases/supplier-accounts'); }
  supplierStatement(supplierId: number) {
    return this.api.get<SupplierStatement>(`/purchases/suppliers/${supplierId}/statement`);
  }
  returnStock(id: number, input: { supplierReference: string; reason: string; lines: { purchaseLineId: number; quantity: number }[] }) {
    return this.api.post<{ id: number; total: number }>(`/purchases/${id}/returns`, input);
  }
  paySupplier(id: number, input: { amount: number; method: string; reference: string }) {
    return this.api.post<{ id: number; amount: number; method: string }>(`/purchases/${id}/payments`, input);
  }
}
