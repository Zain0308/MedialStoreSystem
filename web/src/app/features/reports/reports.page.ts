import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { RouterLink } from '@angular/router';
import { MedicinesApi, Medicine } from '../medicines/public-api';
import { SalesApi, SaleSummary } from '../sales/public-api';
import { ReportsApi } from './reports.api';
import { Dashboard, DetailedReport } from './reports.models';

@Component({
  selector: 'app-reports-page',
  imports: [CommonModule, FormsModule, RouterLink, PageNoticeComponent],
  styleUrl: './reports.page.css',
  templateUrl: './reports.page.html',
})
export class ReportsPage extends PageFeedback implements OnInit {
  private readonly api = inject(ReportsApi);
  private readonly medicinesApi = inject(MedicinesApi);
  private readonly salesApi = inject(SalesApi);
  readonly dashboard = signal<Dashboard | null>(null);
  readonly medicines = signal<Medicine[]>([]);
  readonly sales = signal<SaleSummary[]>([]);
  readonly detail = signal<DetailedReport | null>(null);
  fromDate = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  toDate = new Date().toISOString().slice(0, 10);
  ngOnInit(): void {
    void this.perform(async () => {
      const [dashboard, medicines, sales] = await Promise.all([
        this.api.dashboard(),
        this.medicinesApi.list(),
        this.salesApi.list(),
      ]);
      this.dashboard.set(dashboard);
      this.medicines.set(medicines);
      this.sales.set(sales);
      this.detail.set(await this.api.details(this.fromDate, this.toDate));
    });
  }
  loadDetails(): Promise<void> { return this.perform(async () => this.detail.set(await this.api.details(this.fromDate, this.toDate))); }
  download(type: string): Promise<void> {
    return this.perform(async () => {
      const blob = await this.api.export(type, this.fromDate, this.toDate);
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `${type}-report-${this.fromDate}-to-${this.toDate}.csv`; link.click(); URL.revokeObjectURL(url);
    });
  }
}
