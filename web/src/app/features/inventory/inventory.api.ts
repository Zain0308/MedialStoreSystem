import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Batch, ExpiryBatch, InventoryMedicineDetails, StockMovement } from './inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly api = inject(ApiClient);
  list() {
    return this.api.get<Batch[]>('/inventory');
  }
  expiryBatches() {
    return this.api.get<ExpiryBatch[]>('/inventory/expiry');
  }
  medicineDetails(medicineId: number) {
    return this.api.get<InventoryMedicineDetails>(`/inventory/medicines/${medicineId}/details`);
  }
  movements() { return this.api.get<StockMovement[]>('/inventory/movements?take=500'); }
  adjust(input: { batchId: number; quantityChange: number; reason: string; type: 'Adjustment' | 'Damage' }) {
    return this.api.post<{ id: number; quantity: number }>('/inventory/adjustments', input);
  }
}
