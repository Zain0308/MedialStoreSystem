import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Supplier, CreateSupplier } from './suppliers.models';

@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly api = inject(ApiClient);
  list() {
    return this.api.get<Supplier[]>('/suppliers');
  }
  create(input: CreateSupplier) {
    return this.api.post<{ id: number }>('/suppliers', input);
  }
}
