import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthSession } from '../authentication/public-api';
import { Medicine } from '../medicines/public-api';

export interface CartRow {
  medicine: Medicine;
  quantity: number;
}

@Injectable({ providedIn: 'root' })
export class PosCartStore {
  private readonly session = inject(AuthSession);
  readonly items = signal<CartRow[]>([]);
  readonly cashReceived = signal(0);
  constructor() {
    effect(() => {
      if (!this.session.isAuthenticated()) this.clear();
    });
  }
  add(medicine: Medicine): string | null {
    if (medicine.requiresPrescription)
      return 'Prescription medicine: dispensing workflow is not enabled yet.';
    const row = this.items().find((x) => x.medicine.id === medicine.id);
    if (medicine.stock < (row?.quantity ?? 0) + 1) return 'Not enough saleable stock.';
    this.items.update((rows) =>
      row
        ? rows.map((x) =>
            x.medicine.id === medicine.id ? { medicine, quantity: x.quantity + 1 } : x,
          )
        : [...rows, { medicine, quantity: 1 }],
    );
    return null;
  }
  setQuantity(id: number, quantity: number): void {
    this.items.update((rows) => rows.map((x) => (x.medicine.id === id ? { ...x, quantity } : x)));
  }
  remove(id: number): void {
    this.items.update((rows) => rows.filter((x) => x.medicine.id !== id));
  }
  clear(): void {
    this.items.set([]);
    this.cashReceived.set(0);
  }
}
