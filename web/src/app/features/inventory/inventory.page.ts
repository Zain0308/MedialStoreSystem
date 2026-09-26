import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { FormsModule } from '@angular/forms';
import { AuthSession } from '../authentication/public-api';
import { pageSlice, TABLE_PAGE_SIZE, TablePaginationComponent } from '../../shared/ui/table-pagination.component';
import { SearchPickerComponent, SearchPickerOption } from '../../shared/ui/search-picker.component';

import { InventoryApi } from './inventory.api';
import { Batch, InventoryMedicineDetails, StockMovement } from './inventory.models';
import { InventoryDetailsDialogComponent } from './inventory-details-dialog.component';
import { PurchaseCreateDialogComponent, PurchaseResult } from '../purchases/public-api';

type InventoryProductGroup = {
  medicineId: number;
  medicineIds: number[];
  medicine: string;
  batches: Batch[];
  totalQuantity: number;
  statusCounts: Record<string, number>;
};

@Component({
  selector: 'app-inventory-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent, TablePaginationComponent, SearchPickerComponent, InventoryDetailsDialogComponent, PurchaseCreateDialogComponent],
  templateUrl: './inventory.page.html',
  styleUrl: './inventory.page.css',
})
export class InventoryPage extends PageFeedback implements OnInit {
  private readonly api = inject(InventoryApi);
  readonly batches = signal<Batch[]>([]);
  readonly batchOptions = computed<SearchPickerOption[]>(() => this.batches().map(batch => ({
    value: batch.id, label: this.medicineLabel(batch),
    detail: `${batch.number} · ${batch.expiryDate} · ${batch.quantity} units`, searchText: `${batch.number} ${batch.genericName ?? ''} ${batch.strength ?? ''} ${batch.dosageForm ?? ''}`,
  })));
  readonly batchSearch = signal('');
  readonly batchStatus = signal('all');
  readonly expiryFrom = signal('');
  readonly expiryTo = signal('');
  readonly batchPage = signal(1);
  readonly filteredBatches = computed(() => {
    const term = this.batchSearch().trim().toLocaleLowerCase();
    const status = this.batchStatus();
    const from = this.expiryFrom(); const to = this.expiryTo();
    return this.batches().filter(batch => {
      const batchStatus = this.status(batch);
      return (!term || [batch.medicine, batch.genericName ?? '', batch.strength ?? '', batch.dosageForm ?? '', batch.number]
        .some(value => value.toLocaleLowerCase().includes(term))) &&
        (status === 'all' || status === batchStatus) && (!from || batch.expiryDate >= from) && (!to || batch.expiryDate <= to);
    });
  });
  readonly products = computed<InventoryProductGroup[]>(() => {
    const groups = new Map<string, Batch[]>();
    for (const batch of this.batches()) {
      const key = [batch.medicine, batch.genericName ?? '', batch.strength ?? '', batch.dosageForm ?? '']
        .map(value => value.trim().toLocaleLowerCase()).join('\u0000');
      groups.set(key, [...(groups.get(key) ?? []), batch]);
    }
    return [...groups.values()].map(batches => {
      const medicineIds = [...new Set(batches.map(batch => batch.medicineId))];
      const medicine = batches.map(batch => batch.medicine.trim())
        .find(name => name && name[0] !== name[0].toLocaleLowerCase()) ?? batches[0]?.medicine ?? '';
      const representative = batches[0];
      return {
        medicineId: medicineIds[0], medicineIds,
        medicine: this.medicineLabel({ medicine, genericName: representative?.genericName,
          strength: representative?.strength, dosageForm: representative?.dosageForm }),
        batches,
        totalQuantity: batches.reduce((sum, batch) => sum +
          (this.status(batch) === 'Expired' ? 0 : batch.quantity), 0),
        statusCounts: batches.reduce<Record<string, number>>((counts, batch) => {
          const key = this.status(batch); counts[key] = (counts[key] ?? 0) + 1; return counts;
        }, {}),
      };
    }).sort((a, b) => a.medicine.localeCompare(b.medicine));
  });
  readonly filteredProducts = computed(() => {
    const matchingBatchIds = new Set(this.filteredBatches().map(batch => batch.id));
    return this.products().filter(product => product.batches.some(batch => matchingBatchIds.has(batch.id)));
  });
  readonly visibleProducts = computed(() => pageSlice(this.filteredProducts(), this.batchPage()));
  readonly pageSize = TABLE_PAGE_SIZE;
  readonly purchaseDialogOpen = signal(false);
  readonly purchaseMedicineId = signal(0);
  readonly expandedMedicineId = signal<number | null>(null);
  readonly selectedProductName = signal('');
  readonly productDetails = signal<InventoryMedicineDetails | null>(null);
  readonly detailsLoading = signal(false);
  private detailsRequest = 0;
  readonly movements = signal<StockMovement[]>([]);
  readonly session = inject(AuthSession);
  readonly movementType = signal<'All' | 'Purchase' | 'Sale' | 'Adjustment'>('All');
  readonly movementSearch = signal('');
  readonly movementFromDate = signal('');
  readonly movementToDate = signal('');
  readonly movementPage = signal(1);
  readonly filteredMovements = computed(() => {
    const type = this.movementType();
    const from = this.movementFromDate();
    const to = this.movementToDate();
    return this.movements().filter(movement => {
      const date = this.localDateKey(movement.createdAt);
      if (from && date < from) return false;
      if (to && date > to) return false;
      const term = this.movementSearch().trim().toLocaleLowerCase();
      if (term && ![movement.medicine, movement.batch, movement.reason, movement.type]
        .some(value => value.toLocaleLowerCase().includes(term))) return false;
      if (type === 'Purchase') return movement.type === 'Purchase' || movement.type === 'PurchaseReturn';
      if (type === 'Sale') return movement.type === 'Sale' || movement.type === 'SaleReturn' || movement.type === 'DamagedReturn';
      if (type === 'Adjustment') return movement.type === 'Adjustment' || movement.type === 'Damage';
      return true;
    });
  });
  readonly totalMovementPages = computed(() => Math.max(1, Math.ceil(this.filteredMovements().length / this.pageSize)));
  readonly visibleMovements = computed(() => {
    const start = (this.movementPage() - 1) * this.pageSize;
    return this.filteredMovements().slice(start, start + this.pageSize);
  });
  adjustment = { batchId: 0, quantity: 1, type: 'Damage' as 'Adjustment' | 'Damage', reason: '' };
  ngOnInit(): void {
    void this.perform(async () => this.refresh());
  }
  canCreatePurchase(): boolean {
    return this.session.hasPermission('purchases.manage') && this.session.hasPermission('medicines.read') &&
      this.session.hasPermission('suppliers.read');
  }
  openPurchase(medicineId = 0): void {
    this.purchaseMedicineId.set(medicineId);
    this.purchaseDialogOpen.set(true);
  }
  onPurchaseCompleted(result: PurchaseResult): void {
    this.purchaseDialogOpen.set(false);
    void this.perform(async () => {
      await this.refresh();
      this.message.set(result.supplierCreditApplied
        ? `Purchase received. Rs ${result.supplierCreditApplied.toFixed(2)} supplier credit was applied.`
        : 'Purchase received and inventory updated.');
    });
  }
  private async refresh(): Promise<void> {
    const [batches, movements] = await Promise.all([this.api.list(), this.api.movements()]);
    this.batches.set(batches); this.movements.set(movements);
    this.batchPage.set(1);
    this.movementPage.set(1);
    if (!this.adjustment.batchId && batches.length) this.adjustment.batchId = batches[0].id;
    const expandedId = this.expandedMedicineId();
    if (expandedId !== null) this.productDetails.set(await this.api.medicineDetails(expandedId));
  }
  resetMovementPage(): void { this.movementPage.set(1); }
  clearMovementFilters(): void {
    this.movementType.set('All'); this.movementFromDate.set(''); this.movementToDate.set(''); this.movementSearch.set('');
    this.movementPage.set(1);
  }
  previousMovementPage(): void { this.movementPage.update(page => Math.max(1, page - 1)); }
  nextMovementPage(): void { this.movementPage.update(page => Math.min(this.totalMovementPages(), page + 1)); }
  movementStart(): number { return this.filteredMovements().length ? (this.movementPage() - 1) * this.pageSize + 1 : 0; }
  movementEnd(): number { return Math.min(this.movementPage() * this.pageSize, this.filteredMovements().length); }
  async toggleProductDetails(product: InventoryProductGroup): Promise<void> {
    if (this.expandedMedicineId() === product.medicineId) {
      this.closeProductDetails();
      return;
    }
    this.detailsRequest++;
    const request = this.detailsRequest;
    this.expandedMedicineId.set(product.medicineId); this.selectedProductName.set(product.medicine);
    this.productDetails.set(null); this.detailsLoading.set(true);
    await this.perform(async () => {
      const allDetails = await Promise.all(product.medicineIds.map(id => this.api.medicineDetails(id)));
      const first = allDetails[0];
      const details: InventoryMedicineDetails = {
        medicine: first.medicine,
        batches: allDetails.flatMap(item => item.batches),
        purchases: allDetails.flatMap(item => item.purchases).sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)),
        payments: allDetails.flatMap(item => item.payments).sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
        returns: allDetails.flatMap(item => item.returns).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        corrections: allDetails.flatMap(item => item.corrections).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      };
      if (this.detailsRequest === request) this.productDetails.set(details);
    });
    if (this.detailsRequest === request) this.detailsLoading.set(false);
  }
  closeProductDetails(): void {
    this.detailsRequest++; this.expandedMedicineId.set(null); this.selectedProductName.set('');
    this.productDetails.set(null); this.detailsLoading.set(false);
  }
  submitAdjustment(): Promise<void> {
    return this.perform(async () => {
      const change = this.adjustment.type === 'Damage' ? -Math.abs(+this.adjustment.quantity) : +this.adjustment.quantity;
      await this.api.adjust({ batchId: +this.adjustment.batchId, quantityChange: change,
        reason: this.adjustment.reason, type: this.adjustment.type });
      this.adjustment.reason = ''; await this.refresh(); this.message.set('Stock movement recorded.');
    });
  }
  status(batch: Batch): string {
    const today = this.dateKey(new Date());
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    if (batch.expiryDate <= today) return 'Expired';
    if (batch.quantity === 0) return 'Out of stock';
    return batch.expiryDate <= this.dateKey(cutoff) ? 'Near expiry' : 'Available';
  }
  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  private medicineLabel(batch: Pick<Batch, 'medicine' | 'genericName' | 'strength' | 'dosageForm'>): string {
    const details = [batch.genericName?.trim(), batch.strength?.trim(), batch.dosageForm?.trim()].filter(Boolean);
    return details.length ? `${batch.medicine} · ${details.join(' · ')}` : batch.medicine;
  }
  private localDateKey(value: string): string {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
