import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { CreatePurchase, PurchaseResult } from './purchases.models';

@Injectable({ providedIn: 'root' })
export class PurchasesApi {
  private readonly api = inject(ApiClient);
  receive(input: CreatePurchase) {
    return this.api.post<PurchaseResult>('/purchases', input);
  }
}
