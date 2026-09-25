import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Medicine, SaveMedicine } from './medicines.models';

@Injectable({ providedIn: 'root' })
export class MedicinesApi {
  private readonly api = inject(ApiClient);
  list() {
    return this.api.get<Medicine[]>('/medicines');
  }
  create(input: SaveMedicine) {
    return this.api.post<{ id: number }>('/medicines', input);
  }
  update(id: number, input: SaveMedicine) {
    return this.api.put<{ id: number }>(`/medicines/${id}`, input);
  }
  setActive(id: number, isActive: boolean) {
    return this.api.put<{ id: number; isActive: boolean }>(`/medicines/${id}/status`, { isActive });
  }
}
