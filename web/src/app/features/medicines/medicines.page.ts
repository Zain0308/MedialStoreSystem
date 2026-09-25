import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { AuthSession } from '../authentication/public-api';

import { MedicinesApi } from './medicines.api';
import { Medicine, CreateMedicine } from './medicines.models';

@Component({
  selector: 'app-medicines-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent],
  templateUrl: './medicines.page.html',
})
export class MedicinesPage extends PageFeedback implements OnInit {
  private readonly api = inject(MedicinesApi);
  readonly session = inject(AuthSession);
  readonly medicines = signal<Medicine[]>([]);
  medicineForm: CreateMedicine = this.emptyForm();
  ngOnInit(): void {
    void this.perform(async () => this.medicines.set(await this.api.list()));
  }
  addMedicine(): Promise<void> {
    return this.perform(async () => {
      await this.api.create(this.medicineForm);
      this.medicineForm = this.emptyForm();
      this.medicines.set(await this.api.list());
      this.message.set('Medicine added.');
    });
  }
  private emptyForm(): CreateMedicine {
    return {
      name: '',
      genericName: '',
      barcode: '',
      minimumStock: 10,
      requiresPrescription: false,
    };
  }
}
