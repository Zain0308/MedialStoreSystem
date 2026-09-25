import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Customer, CustomerLedger, SaveCustomer } from './customers.models';

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly api = inject(ApiClient);
  list() { return this.api.get<Customer[]>('/customers'); }
  create(input: SaveCustomer) { return this.api.post<{ id: number }>('/customers', input); }
  update(id: number, input: SaveCustomer) { return this.api.put<Customer>(`/customers/${id}`, input); }
  setActive(id: number, isActive: boolean) { return this.api.put<{ id: number; isActive: boolean }>(`/customers/${id}/status`, { isActive }); }
  ledger(id: number) { return this.api.get<CustomerLedger>(`/customers/${id}/ledger`); }
  payment(id: number, input: { saleId: number; amount: number; method: string; reference: string }) {
    return this.api.post<{ id: number; amount: number; due: number }>(`/customers/${id}/payments`, input);
  }
  forPos() { return this.api.get<{ id: number; name: string; creditLimit: number }[]>('/sales/customers'); }
}
