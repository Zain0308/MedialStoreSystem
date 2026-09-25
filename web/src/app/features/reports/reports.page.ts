import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { RouterLink } from '@angular/router';
import { MedicinesApi, Medicine } from '../medicines/public-api';
import { SalesApi, SaleSummary } from '../sales/public-api';
import { ReportsApi } from './reports.api';
import { Dashboard } from './reports.models';
import { AuthSession } from '../authentication/public-api';

@Component({
  selector: 'app-reports-page',
  imports: [CommonModule, RouterLink, PageNoticeComponent],
  styleUrl: './reports.page.css',
  templateUrl: './reports.page.html',
})
export class ReportsPage extends PageFeedback implements OnInit {
  private readonly api = inject(ReportsApi);
  readonly session = inject(AuthSession);
  private readonly medicinesApi = inject(MedicinesApi);
  private readonly salesApi = inject(SalesApi);
  readonly dashboard = signal<Dashboard | null>(null);
  readonly medicines = signal<Medicine[]>([]);
  readonly sales = signal<SaleSummary[]>([]);
  private readonly dashboardLoaded = signal(false);
  private readonly expiryEffect = effect(() => {
    if (!this.dashboardLoaded() || !this.session.subscriptionExpired() || this.dashboard()?.subscriptionExpired) return;
    this.medicines.set([]);
    this.sales.set([]);
    void this.perform(async () => {
      const dashboard = await this.api.dashboard();
      this.dashboard.set(dashboard);
      if (dashboard.subscriptionExpired) this.session.markSubscriptionExpired();
    });
  });
  ngOnInit(): void {
    void this.perform(async () => {
      const dashboard = await this.api.dashboard();
      this.dashboard.set(dashboard);
      if (dashboard.subscriptionExpired) this.session.markSubscriptionExpired();
      if (dashboard.subscriptionExpired || this.session.subscriptionExpired()) {
        this.medicines.set([]);
        this.sales.set([]);
        this.dashboardLoaded.set(true);
        return;
      }
      const [medicines, sales] = await Promise.all([
        this.medicinesApi.list(),
        this.salesApi.list(),
      ]);
      this.medicines.set(medicines);
      this.sales.set(sales);
      this.dashboardLoaded.set(true);
    });
  }
}
