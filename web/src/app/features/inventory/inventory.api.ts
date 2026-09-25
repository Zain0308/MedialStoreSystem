import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Batch } from './inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly api = inject(ApiClient);
  list() {
    return this.api.get<Batch[]>('/inventory');
  }
}
