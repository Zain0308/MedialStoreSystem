import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { SaleSummary, Receipt, CreateSale, SaleResult } from './sales.models';

@Injectable({ providedIn: 'root' })
export class SalesApi {
  private readonly api = inject(ApiClient);
  list() {
    return this.api.get<SaleSummary[]>('/sales');
  }
  receipt(id: number) {
    return this.api.get<Receipt>(`/sales/${id}`);
  }
  checkout(input: CreateSale) {
    return this.api.post<SaleResult>('/sales', input);
  }
  returnSale(id: number, input: { reason: string; refundMethod: string; lines: { saleLineId: number; quantity: number; restock: boolean }[] }) {
    return this.api.post<{ id: number; totalRefund: number; refundMethod: string }>(`/sales/${id}/returns`, input);
  }
}
