import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';

import { SuppliersApi } from './suppliers.api';
import { Supplier, CreateSupplier } from './suppliers.models';
import { AuthSession } from '../authentication/public-api';

@Component({
  selector: 'app-suppliers-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent],
  styleUrl: './suppliers.page.css',
  templateUrl: './suppliers.page.html',
})
export class SuppliersPage extends PageFeedback implements OnInit {
  private readonly api = inject(SuppliersApi);
  readonly session = inject(AuthSession);
  readonly suppliers = signal<Supplier[]>([]);
  readonly searchText = signal('');
  readonly editingId = signal<number | null>(null);
  readonly visibleSuppliers = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    if (!query) return this.suppliers();
    return this.suppliers().filter(supplier =>
      [supplier.name, supplier.phone, supplier.contactPerson, supplier.email, supplier.address]
        .some(value => value?.toLocaleLowerCase().includes(query)));
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
  clearSearch(): void { this.searchText.set(''); }
  private emptyForm(): CreateSupplier { return { name: '', phone: '', contactPerson: '', email: '', address: '' }; }
}
