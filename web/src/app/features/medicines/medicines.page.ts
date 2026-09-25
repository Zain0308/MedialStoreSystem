import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { AuthSession } from '../authentication/public-api';

import { MedicinesApi } from './medicines.api';
import { Medicine, SaveMedicine } from './medicines.models';

@Component({
  selector: 'app-medicines-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent],
  templateUrl: './medicines.page.html',
})
export class MedicinesPage extends PageFeedback implements OnInit {
  private readonly api = inject(MedicinesApi);
  readonly session = inject(AuthSession);
  readonly medicines = signal<Medicine[]>([]);
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
  setActive(medicine: Medicine): Promise<void> {
    return this.perform(async () => {
      await this.api.setActive(medicine.id, !medicine.isActive);
      this.medicines.set(await this.api.list());
      this.message.set(medicine.isActive ? 'Medicine deactivated; history and stock were kept.' : 'Medicine activated.');
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
