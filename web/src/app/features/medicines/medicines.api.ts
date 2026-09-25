import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Medicine, CreateMedicine } from './medicines.models';

@Injectable({ providedIn: 'root' })
export class MedicinesApi {
  private readonly api = inject(ApiClient);
  list() {
    return this.api.get<Medicine[]>('/medicines');
  }
  create(input: CreateMedicine) {
    return this.api.post<{ id: number }>('/medicines', input);
  }
}
