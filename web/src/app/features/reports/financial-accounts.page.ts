import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { ReportsApi } from './reports.api';
import { DetailedReport, PayablesReport, ReceivablesReport } from './reports.models';

type FinancialTab = 'profit-loss' | 'payables' | 'receivables';
const currentMonth = new Date().toISOString().slice(0, 7);
const monthDates = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10) };
};

@Component({
  selector: 'app-financial-accounts-page',
  imports: [CommonModule, FormsModule, RouterLink, PageNoticeComponent],
  styleUrl: './reports.page.css',
  templateUrl: './financial-accounts.page.html',
})
export class FinancialAccountsPage extends PageFeedback implements OnInit {
  private readonly api = inject(ReportsApi);
  private readonly route = inject(ActivatedRoute);
  readonly activeFinancialTab = signal<FinancialTab>('profit-loss');
  readonly detail = signal<DetailedReport | null>(null);
  readonly payables = signal<PayablesReport | null>(null);
  readonly receivables = signal<ReceivablesReport | null>(null);
  month = currentMonth;
  fromDate = monthDates(currentMonth).from;
  toDate = monthDates(currentMonth).to;

  ngOnInit(): void {
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (requestedTab === 'payables' || requestedTab === 'receivables') this.activeFinancialTab.set(requestedTab);
    void this.perform(async () => this.detail.set(await this.api.details(this.fromDate, this.toDate)));
    this.loadActiveTab();
  }

  selectFinancialTab(tab: FinancialTab): void {
    this.activeFinancialTab.set(tab);
    this.loadActiveTab();
  }

  private loadActiveTab(): void {
    if (this.activeFinancialTab() === 'payables' && this.payables() === null)
      void this.perform(async () => this.payables.set(await this.api.payables()));
    if (this.activeFinancialTab() === 'receivables' && this.receivables() === null)
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
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}-report-${this.fromDate}-to-${this.toDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }
}
