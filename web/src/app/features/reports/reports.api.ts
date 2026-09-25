import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Dashboard } from './reports.models';

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly api = inject(ApiClient);
  dashboard() {
    return this.api.get<Dashboard>('/dashboard');
  }
}
