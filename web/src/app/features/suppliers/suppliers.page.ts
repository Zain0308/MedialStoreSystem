import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { SuppliersApi } from './suppliers.api';
import { Supplier, CreateSupplier } from './suppliers.models';
import { AuthSession } from '../authentication/public-api';
import { PurchasesApi, SupplierStatement } from '../purchases/public-api';

@Component({
  selector: 'app-suppliers-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent],
  styleUrl: './suppliers.page.css',
  templateUrl: './suppliers.page.html',
})
export class SuppliersPage extends PageFeedback implements OnInit {
  private readonly api = inject(SuppliersApi);
  private readonly purchasesApi = inject(PurchasesApi);
  readonly session = inject(AuthSession);
  readonly suppliers = signal<Supplier[]>([]);
  readonly searchText = signal('');
  readonly statusFilter = signal('all');
  readonly editingId = signal<number | null>(null);
  readonly statement = signal<SupplierStatement | null>(null);
  readonly visibleSuppliers = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    return this.suppliers().filter(supplier => (this.statusFilter() === 'all' || (this.statusFilter() === 'active') === supplier.isActive) &&
      (!query || [supplier.name, supplier.phone, supplier.contactPerson, supplier.email, supplier.address]
        .some(value => value?.toLocaleLowerCase().includes(query))));
  });
  supplierForm: CreateSupplier = this.emptyForm();
  ngOnInit(): void {
    void this.perform(async () => this.suppliers.set(await this.api.list()));
  }
  saveSupplier(): Promise<void> {
    return this.perform(async () => {
      const id = this.editingId();
      if (id === null) await this.api.create(this.supplierForm);
      else await this.api.update(id, this.supplierForm);
      this.supplierForm = this.emptyForm();
      this.editingId.set(null);
      this.suppliers.set(await this.api.list());
      this.message.set(id === null ? 'Supplier added.' : 'Supplier details updated.');
    });
  }
  editSupplier(supplier: Supplier): void {
    this.editingId.set(supplier.id);
    this.supplierForm = {
      name: supplier.name, phone: supplier.phone ?? '', contactPerson: supplier.contactPerson ?? '',
      email: supplier.email ?? '', address: supplier.address ?? '',
    };
  }
  cancelEdit(): void { this.editingId.set(null); this.supplierForm = this.emptyForm(); }
  setActive(supplier: Supplier): Promise<void> {
    return this.perform(async () => {
      await this.api.setActive(supplier.id, !supplier.isActive);
      this.suppliers.set(await this.api.list());
      this.message.set(supplier.isActive ? 'Supplier deactivated.' : 'Supplier activated.');
    });
  }
  openLedger(supplier: Supplier): Promise<void> {
    return this.perform(async () => this.statement.set(await this.purchasesApi.supplierStatement(supplier.id)));
  }
  closeLedger(): void { this.statement.set(null); }
  balance(invoice: { total: number; returnedTotal: number; paidTotal: number }): number {
    return Math.max(0, invoice.total - invoice.returnedTotal - invoice.paidTotal);
  }
  clearSearch(): void { this.searchText.set(''); }
  private emptyForm(): CreateSupplier { return { name: '', phone: '', contactPerson: '', email: '', address: '' }; }
}
