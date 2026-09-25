import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { RouterLink } from '@angular/router';
import { MedicinesApi, Medicine } from '../medicines/public-api';
import { SalesApi, SaleSummary } from '../sales/public-api';
import { ReportsApi } from './reports.api';
import { Dashboard } from './reports.models';

@Component({
  selector: 'app-reports-page',
  imports: [CommonModule, RouterLink, PageNoticeComponent],
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
    });
  }
}
