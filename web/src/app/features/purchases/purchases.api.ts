import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { CreatePurchase, PurchaseCorrectionHistory, PurchaseHistory, PurchaseResult, SupplierAccountSummary, SupplierStatement } from './purchases.models';

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
  corrections(id: number) { return this.api.get<PurchaseCorrectionHistory[]>(`/purchases/${id}/corrections`); }
  correct(id: number, input: { reason: string; lines: { purchaseLineId: number; correctedQuantity: number }[] }) {
    return this.api.post<{ id: number; previousTotal: number; correctedTotal: number; quantityChanges: number }>(`/purchases/${id}/corrections`, input);
  }
  returnStock(id: number, input: { supplierReference: string; reason: string; lines: { purchaseLineId: number; quantity: number }[] }) {
    return this.api.post<{ id: number; total: number }>(`/purchases/${id}/returns`, input);
  }
  paySupplier(id: number, input: { amount: number; method: string; reference: string }) {
    return this.api.post<{ id: number; amount: number; method: string; supplierCreditAdded: number }>(`/purchases/${id}/payments`, input);
  }
}
