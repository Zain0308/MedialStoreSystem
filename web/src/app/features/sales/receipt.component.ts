import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Receipt } from './sales.models';

@Component({
  selector: 'app-receipt',
  imports: [CommonModule],
  styleUrl: './receipt.component.css',
  templateUrl: './receipt.component.html',
})
export class ReceiptComponent {
  readonly receipt = input.required<Receipt>();
  readonly closed = output<void>();
  printReceipt(): void {
    window.print();
  }
}
