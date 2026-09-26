import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { InventoryMedicineDetails } from './inventory.models';

@Component({
  selector: 'app-inventory-details-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inventory-details-dialog.component.html',
  styleUrl: './inventory-details-dialog.component.css',
})
export class InventoryDetailsDialogComponent {
  @Input() productName = '';
  @Input() details: InventoryMedicineDetails | null = null;
  @Input() loading = false;
  @Output() closed = new EventEmitter<void>();
  readonly activeTab = signal<'purchases' | 'payments' | 'returns' | 'corrections'>('purchases');

  stockTotal(details: InventoryMedicineDetails): number {
    return details.batches.reduce((total, batch) => total + batch.quantity, 0);
  }
}
