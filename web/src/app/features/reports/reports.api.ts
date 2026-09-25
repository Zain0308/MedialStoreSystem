import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { Dashboard, DetailedReport } from './reports.models';

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly api = inject(ApiClient);
  dashboard() {
    return this.api.get<Dashboard>('/dashboard');
  }
  details(from: string, to: string) { return this.api.get<DetailedReport>(`/reports/details?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); }
  export(type: string, from: string, to: string) {
    return this.api.getBlob(`/reports/export?type=${encodeURIComponent(type)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }
}
