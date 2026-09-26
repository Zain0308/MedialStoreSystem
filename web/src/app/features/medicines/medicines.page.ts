import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { AuthSession } from '../authentication/public-api';
import { pageSlice, TABLE_PAGE_SIZE, TablePaginationComponent } from '../../shared/ui/table-pagination.component';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';

import { MedicinesApi } from './medicines.api';
import { Medicine, SaveMedicine } from './medicines.models';

@Component({
  selector: 'app-medicines-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent, TablePaginationComponent, ConfirmDialogComponent],
  templateUrl: './medicines.page.html',
})
export class MedicinesPage extends PageFeedback implements OnInit {
  private readonly api = inject(MedicinesApi);
  readonly session = inject(AuthSession);
  readonly medicines = signal<Medicine[]>([]);
  readonly search = signal('');
  readonly statusFilter = signal('all');
  readonly tablePage = signal(1);
  readonly filteredMedicines = computed(() => {
    const term = this.search().trim().toLocaleLowerCase();
    const status = this.statusFilter();
    return this.medicines().filter(m => (status === 'all' || (status === 'active') === m.isActive) &&
      (!term || [m.name, m.genericName, m.barcode, m.strength, m.dosageForm, m.manufacturer]
        .some(value => value?.toLocaleLowerCase().includes(term))));
  });
  readonly visibleMedicines = computed(() => pageSlice(this.filteredMedicines(), this.tablePage()));
  readonly pageSize = TABLE_PAGE_SIZE;
  readonly pendingStatusChange = signal<Medicine | null>(null);
  medicineForm: SaveMedicine = this.emptyForm();
  editingId: number | null = null;
  ngOnInit(): void {
    void this.perform(async () => this.medicines.set(await this.api.list()));
  }
  saveMedicine(): Promise<void> {
    return this.perform(async () => {
      if (this.editingId === null) await this.api.create(this.medicineForm);
      else await this.api.update(this.editingId, this.medicineForm);
      const wasEditing = this.editingId !== null;
      this.editingId = null;
      this.medicineForm = this.emptyForm();
      this.medicines.set(await this.api.list());
      this.tablePage.set(1);
      this.message.set(wasEditing ? 'Medicine updated.' : 'Medicine added.');
    });
  }
  edit(medicine: Medicine): void {
    this.editingId = medicine.id;
    this.medicineForm = { name: medicine.name, genericName: medicine.genericName ?? '', barcode: medicine.barcode ?? '',
      minimumStock: medicine.minimumStock, requiresPrescription: medicine.requiresPrescription, strength: medicine.strength ?? '',
      dosageForm: medicine.dosageForm ?? '', manufacturer: medicine.manufacturer ?? '', description: medicine.description ?? '' };
  }
  cancelEdit(): void { this.editingId = null; this.medicineForm = this.emptyForm(); }
  setActive(medicine: Medicine): void { this.pendingStatusChange.set(medicine); }
  confirmStatusChange(): Promise<void> {
    const medicine = this.pendingStatusChange();
    if (!medicine) return Promise.resolve();
    return this.perform(async () => {
      await this.api.setActive(medicine.id, !medicine.isActive);
      this.medicines.set(await this.api.list());
      this.tablePage.set(1);
      this.message.set(medicine.isActive ? 'Medicine deactivated; history and stock were kept.' : 'Medicine activated.');
      this.pendingStatusChange.set(null);
    });
  }
  private emptyForm(): SaveMedicine {
    return {
      name: '',
      genericName: '',
      strength: '', dosageForm: '', manufacturer: '', description: '',
      barcode: '',
      minimumStock: 10,
      requiresPrescription: false,
    };
  }
}
