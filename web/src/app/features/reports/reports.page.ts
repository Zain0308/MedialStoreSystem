import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { RouterLink } from '@angular/router';
import { MedicinesApi, Medicine } from '../medicines/public-api';
import { SalesApi, SaleSummary } from '../sales/public-api';
import { ReportsApi } from './reports.api';
import { Dashboard, DetailedReport, PayablesReport, ReceivablesReport } from './reports.models';

type FinancialTab = 'profit-loss' | 'payables' | 'receivables';
const currentMonth = new Date().toISOString().slice(0, 7);
const monthDates = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10) };
};

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
  readonly activeFinancialTab = signal<FinancialTab>('profit-loss');
  readonly payables = signal<PayablesReport | null>(null);
  readonly receivables = signal<ReceivablesReport | null>(null);
  month = currentMonth;
  fromDate = monthDates(currentMonth).from;
  toDate = monthDates(currentMonth).to;
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
  selectFinancialTab(tab: FinancialTab): void {
    this.activeFinancialTab.set(tab);
    if (tab === 'payables' && this.payables() === null)
      void this.perform(async () => this.payables.set(await this.api.payables()));
    if (tab === 'receivables' && this.receivables() === null)
      void this.perform(async () => this.receivables.set(await this.api.receivables()));
  }
  setProfitLossMonth(month: string): Promise<void> {
    if (!month) return Promise.resolve();
    this.month = month;
    const dates = monthDates(month);
    this.fromDate = dates.from;
    this.toDate = dates.to;
    return this.loadDetails();
  }
  customersWithOutstandingBalance(): number {
    return this.receivables()?.customers.filter(customer => customer.amountDue > 0).length ?? 0;
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
