import { Component, inject, OnInit, signal } from '@angular/core';
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
  supplierForm: CreateSupplier = { name: '', phone: '' };
  ngOnInit(): void {
    void this.perform(async () => this.suppliers.set(await this.api.list()));
  }
  addSupplier(): Promise<void> {
    return this.perform(async () => {
      await this.api.create(this.supplierForm);
      this.supplierForm = { name: '', phone: '' };
      this.suppliers.set(await this.api.list());
      this.message.set('Supplier added.');
    });
  }
}
