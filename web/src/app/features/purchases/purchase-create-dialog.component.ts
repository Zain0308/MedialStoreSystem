import { CommonModule } from '@angular/common';
import { Component, computed, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthSession } from '../authentication/public-api';
import { Medicine, MedicinesApi, SaveMedicine } from '../medicines/public-api';
import { CreateSupplier, Supplier, SuppliersApi } from '../suppliers/public-api';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { CreatePurchase, PurchaseResult } from './purchases.models';
import { PurchasesApi } from './purchases.api';

type PurchaseLineDraft = {
  key: number;
  medicineId: number;
  medicineName: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
};

@Component({
  selector: 'app-purchase-create-dialog',
  imports: [CommonModule, FormsModule, PageNoticeComponent],
  templateUrl: './purchase-create-dialog.component.html',
  styleUrl: './purchase-create-dialog.component.css',
})
export class PurchaseCreateDialogComponent extends PageFeedback implements OnInit {
  @Input() initialMedicineId = 0;
  @Output() closed = new EventEmitter<void>();
  @Output() completed = new EventEmitter<PurchaseResult>();

  private readonly purchaseApi = inject(PurchasesApi);
  private readonly medicinesApi = inject(MedicinesApi);
  private readonly suppliersApi = inject(SuppliersApi);
  readonly session = inject(AuthSession);
  readonly medicines = signal<Medicine[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly lines = signal<PurchaseLineDraft[]>([]);
  readonly supplierSearch = signal('');
  readonly medicineSearch = signal('');
  readonly addSupplierForm = signal(false);
  readonly addMedicineForm = signal(false);
  readonly newSupplier: CreateSupplier = { name: '', phone: '', contactPerson: '', email: '', address: '' };
  readonly newMedicine: SaveMedicine = { name: '', genericName: '', barcode: '', strength: '', dosageForm: '',
    manufacturer: '', description: '', minimumStock: 0, requiresPrescription: false };
  readonly supplierId = signal<number | null>(null);
  readonly supplierResults = computed(() => {
    const term = this.supplierSearch().trim().toLocaleLowerCase();
    if (!term) return [];
    const selected = this.suppliers().find(supplier => supplier.id === this.supplierId());
    if (selected?.name.toLocaleLowerCase() === term) return [];
    return this.suppliers().filter(supplier => supplier.isActive &&
      [supplier.name, supplier.contactPerson ?? '', supplier.phone ?? '', supplier.email ?? '']
        .some(value => value.toLocaleLowerCase().includes(term))).slice(0, 8);
  });
  readonly medicineResults = computed(() => {
    const term = this.medicineSearch().trim().toLocaleLowerCase();
    if (!term) return [];
    return this.medicines().filter(medicine => medicine.isActive &&
      [medicine.name, medicine.genericName ?? '', medicine.barcode ?? '', medicine.strength ?? '', medicine.dosageForm ?? '']
        .some(value => value.toLocaleLowerCase().includes(term))).slice(0, 8);
  });
  readonly inactiveMedicineMatch = computed(() => {
    const term = this.medicineSearch().trim().toLocaleLowerCase();
    return this.medicines().find(medicine => !medicine.isActive && medicine.name.trim().toLocaleLowerCase() === term) ?? null;
  });
  purchaseTotal(): number {
    return this.lines().reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.costPrice || 0), 0);
  }
  readonly today = new Date().toISOString().slice(0, 10);
  readonly canAddSupplier = computed(() => this.session.hasPermission('suppliers.manage'));
  readonly canAddMedicine = computed(() => this.session.hasPermission('medicines.manage'));
  private nextLineKey = 1;

  ngOnInit(): void {
    void this.perform(async () => {
      const [medicines, suppliers] = await Promise.all([this.medicinesApi.list(), this.suppliersApi.list()]);
      this.medicines.set(medicines);
      this.suppliers.set(suppliers);
      if (this.initialMedicineId) {
        const medicine = medicines.find(item => item.id === this.initialMedicineId && item.isActive);
        if (medicine) this.addMedicineLine(medicine);
      }
    });
  }

  searchSupplier(value: string): void {
    this.supplierSearch.set(value);
    this.supplierId.set(null);
    this.addSupplierForm.set(false);
  }

  selectSupplier(supplier: Supplier): void {
    this.supplierId.set(supplier.id);
    this.supplierSearch.set(supplier.name);
    this.addSupplierForm.set(false);
  }

  supplierNotFound(): boolean {
    return !!this.supplierSearch().trim() && this.supplierResults().length === 0;
  }

  startAddingSupplier(): void {
    this.newSupplier.name = this.supplierSearch().trim();
    this.addSupplierForm.set(true);
  }

  async createSupplier(): Promise<void> {
    if (!this.newSupplier.name.trim()) return;
    await this.perform(async () => {
      const created = await this.suppliersApi.create({ ...this.newSupplier, name: this.newSupplier.name.trim() });
      const supplier: Supplier = { ...this.newSupplier, id: created.id, name: this.newSupplier.name.trim(), isActive: true };
      this.suppliers.update(items => [...items, supplier]);
      this.selectSupplier(supplier);
      this.addSupplierForm.set(false);
      this.message.set(`${supplier.name} added and selected.`);
    });
  }

  searchMedicine(value: string): void {
    this.medicineSearch.set(value);
    this.addMedicineForm.set(false);
  }

  medicineNotFound(): boolean {
    return !!this.medicineSearch().trim() && this.medicineResults().length === 0 && !this.inactiveMedicineMatch();
  }

  async activateAndAddMedicine(medicine: Medicine): Promise<void> {
    await this.perform(async () => {
      await this.medicinesApi.setActive(medicine.id, true);
      const active = { ...medicine, isActive: true };
      this.medicines.update(items => items.map(item => item.id === active.id ? active : item));
      this.addMedicineLine(active);
    });
  }

  startAddingMedicine(): void {
    this.newMedicine.name = this.medicineSearch().trim();
    this.addMedicineForm.set(true);
  }

  addMedicineLine(medicine: Medicine): void {
    this.lines.update(lines => [...lines, { key: this.nextLineKey++, medicineId: medicine.id, medicineName: medicine.name, batchNumber: '',
      expiryDate: '', quantity: 1, costPrice: 0, salePrice: 0 }]);
    this.medicineSearch.set('');
    this.addMedicineForm.set(false);
    this.message.set(`${medicine.name} added to this purchase.`);
  }

  updateLine(lineKey: number, patch: Partial<Pick<PurchaseLineDraft,
    'batchNumber' | 'expiryDate' | 'quantity' | 'costPrice' | 'salePrice'>>): void {
    this.lines.update(lines => lines.map(line => line.key === lineKey ? { ...line, ...patch } : line));
  }

  medicineDetails(medicine: Medicine): string {
    return [medicine.genericName, medicine.strength, medicine.dosageForm].filter(Boolean).join(' · ') || 'Medicine';
  }

  removeLine(lineKey: number): void {
    this.lines.update(lines => lines.filter(line => line.key !== lineKey));
  }

  async createMedicine(): Promise<void> {
    if (!this.newMedicine.name.trim()) return;
    await this.perform(async () => {
      const input = { ...this.newMedicine, name: this.newMedicine.name.trim() };
      const created = await this.medicinesApi.create(input);
      const medicine: Medicine = { ...input, id: created.id, stock: 0, isActive: true };
      this.medicines.update(items => [...items, medicine]);
      this.addMedicineLine(medicine);
      this.addMedicineForm.set(false);
    });
  }

  canSubmit(): boolean {
    return !this.busy() && !!this.supplierId() && !!this.supplierInvoice.trim() && this.lines().length > 0 &&
      this.lines().every(line => line.batchNumber.trim() && line.expiryDate >= this.today && line.quantity > 0 && line.costPrice >= 0 && line.salePrice >= 0);
  }

  supplierInvoice = '';

  submit(): Promise<void> {
    if (!this.canSubmit()) return Promise.resolve();
    return this.perform(async () => {
      const request: CreatePurchase = {
        supplierId: this.supplierId()!,
        supplierInvoice: this.supplierInvoice.trim(),
        lines: this.lines().map(line => ({ medicineId: line.medicineId, batchNumber: line.batchNumber.trim(),
          expiryDate: line.expiryDate, quantity: Number(line.quantity), costPrice: Number(line.costPrice), salePrice: Number(line.salePrice) })),
      };
      const result = await this.purchaseApi.receive(request);
      this.completed.emit(result);
    });
  }
}
