import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

type Tab = 'dashboard' | 'pos' | 'medicines' | 'purchases' | 'inventory' | 'sales';
interface Medicine { id: number; name: string; genericName?: string; barcode?: string; stock: number; minimumStock: number; requiresPrescription: boolean; isActive: boolean }
interface Supplier { id: number; name: string; phone?: string }
interface Batch { id: number; medicineId: number; medicine: string; number: string; expiryDate: string; costPrice: number; salePrice: number; quantity: number }
interface SaleSummary { id: number; invoiceNumber: string; createdAt: string; total: number }
interface Receipt { invoiceNumber: string; createdAt: string; total: number; cashReceived: number; lines: { medicine: string; batch: string; quantity: number; unitPrice: number; total: number }[] }
interface Dashboard { todaySales: number; todayInvoices: number; medicineCount: number; expiringBatches: number; expiredBatches: number }

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private http = inject(HttpClient);
  token = sessionStorage.getItem('medical-token') ?? '';
  email = sessionStorage.getItem('medical-email') ?? '';
  loginEmail = '';
  loginPassword = '';
  tab: Tab = 'dashboard';
  message = '';
  busy = false;
  dashboard: Dashboard | null = null;
  medicines: Medicine[] = [];
  suppliers: Supplier[] = [];
  batches: Batch[] = [];
  sales: SaleSummary[] = [];
  receipt: Receipt | null = null;
  search = '';
  medicineForm = { name: '', genericName: '', barcode: '', minimumStock: 10, requiresPrescription: false };
  supplierForm = { name: '', phone: '' };
  purchase = { supplierId: 0, supplierInvoice: '', medicineId: 0, batchNumber: '', expiryDate: '', quantity: 1, costPrice: 0, salePrice: 0 };
  cart: { medicine: Medicine; quantity: number }[] = [];
  cashReceived = 0;

  constructor() { if (this.token) void this.refresh(); }
  private headers() { return { headers: new HttpHeaders({ Authorization: `Bearer ${this.token}` }) }; }
  private get<T>(url: string) { return firstValueFrom(this.http.get<T>(`/api${url}`, this.headers())); }
  private post<T>(url: string, body: unknown) { return firstValueFrom(this.http.post<T>(`/api${url}`, body, this.headers())); }
  private error(e: unknown) {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 401) { this.logout(); return 'Session expired. Please sign in again.'; }
      return typeof e.error === 'string' ? e.error : e.error?.title ?? `Request failed (${e.status || 'network'}).`;
    }
    return 'Something went wrong.';
  }
  async login() {
    this.busy = true; this.message = '';
    try {
      const result = await firstValueFrom(this.http.post<{ token: string; email: string }>('/api/auth/login',
        { email: this.loginEmail, password: this.loginPassword }));
      this.token = result.token; this.email = result.email; this.loginPassword = '';
      sessionStorage.setItem('medical-token', this.token); sessionStorage.setItem('medical-email', this.email);
      await this.refresh();
    } catch (e) { this.message = e instanceof HttpErrorResponse && e.status === 401 ? 'Email or password is incorrect.' : this.error(e); }
    finally { this.busy = false; }
  }
  logout() { this.token = ''; this.email = ''; sessionStorage.removeItem('medical-token'); sessionStorage.removeItem('medical-email'); }
  async refresh() {
    try {
      const [dashboard, medicines, suppliers, batches, sales] = await Promise.all([
        this.get<Dashboard>('/dashboard'), this.get<Medicine[]>('/medicines'), this.get<Supplier[]>('/suppliers'),
        this.get<Batch[]>('/inventory'), this.get<SaleSummary[]>('/sales')]);
      Object.assign(this, { dashboard, medicines, suppliers, batches, sales });
    } catch (e) { this.message = this.error(e); }
  }
  open(tab: Tab) { this.tab = tab; this.message = ''; if (this.token) void this.refresh(); }
  async addMedicine() {
    this.busy = true; this.message = '';
    try { await this.post('/medicines', this.medicineForm); this.medicineForm = { name: '', genericName: '', barcode: '', minimumStock: 10, requiresPrescription: false }; this.message = 'Medicine added.'; await this.refresh(); }
    catch (e) { this.message = this.error(e); } finally { this.busy = false; }
  }
  async addSupplier() {
    this.busy = true; this.message = '';
    try { await this.post('/suppliers', this.supplierForm); this.supplierForm = { name: '', phone: '' }; this.message = 'Supplier added.'; await this.refresh(); }
    catch (e) { this.message = this.error(e); } finally { this.busy = false; }
  }
  async receivePurchase() {
    this.busy = true; this.message = '';
    try {
      const p = this.purchase;
      await this.post('/purchases', { supplierId: +p.supplierId, supplierInvoice: p.supplierInvoice,
        lines: [{ medicineId: +p.medicineId, batchNumber: p.batchNumber, expiryDate: p.expiryDate,
          quantity: +p.quantity, costPrice: +p.costPrice, salePrice: +p.salePrice }] });
      this.purchase = { supplierId: p.supplierId, supplierInvoice: '', medicineId: 0, batchNumber: '', expiryDate: '', quantity: 1, costPrice: 0, salePrice: 0 };
      this.message = 'Purchase received; batch stock updated.'; await this.refresh();
    } catch (e) { this.message = this.error(e); } finally { this.busy = false; }
  }
  get filteredMedicines() {
    const q = this.search.trim().toLowerCase();
    return this.medicines.filter(m => m.isActive && (m.name.toLowerCase().includes(q) || (m.barcode ?? '').toLowerCase().includes(q))).slice(0, 12);
  }
  addToCart(m: Medicine) {
    if (m.requiresPrescription) { this.message = 'Prescription medicine: dispensing workflow is not enabled yet.'; return; }
    if (m.stock < 1) { this.message = 'No saleable stock available.'; return; }
    const row = this.cart.find(x => x.medicine.id === m.id);
    if (row) { if (row.quantity >= m.stock) { this.message = 'Not enough stock.'; return; } row.quantity++; }
    else this.cart.push({ medicine: m, quantity: 1 });
    this.message = '';
  }
  removeFromCart(id: number) { this.cart = this.cart.filter(x => x.medicine.id !== id); }
  // Estimated prices can vary by batch. The server calculates the final FEFO total.
  price(m: Medicine) { return this.batches.filter(b => b.medicineId === m.id && b.quantity > 0 && b.expiryDate >= this.today).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0]?.salePrice ?? 0; }
  get today() { return new Date().toISOString().slice(0, 10); }
  get estimate() { return this.cart.reduce((sum, x) => sum + x.quantity * this.price(x.medicine), 0); }
  async completeSale() {
    this.busy = true; this.message = '';
    try {
      const result = await this.post<{ id: number; total: number }>('/sales', {
        lines: this.cart.map(x => ({ medicineId: x.medicine.id, quantity: +x.quantity })), cashReceived: +this.cashReceived });
      this.receipt = await this.get<Receipt>(`/sales/${result.id}`);
      this.cart = []; this.cashReceived = 0;
      this.message = 'Sale completed. Invoice is ready to print.'; await this.refresh();
    } catch (e) { this.message = this.error(e); } finally { this.busy = false; }
  }
  async viewReceipt(id: number) {
    try { this.receipt = await this.get<Receipt>(`/sales/${id}`); this.tab = 'sales'; this.message = ''; }
    catch (e) { this.message = this.error(e); }
  }
  printReceipt() { window.print(); }
  status(b: Batch) { if (b.expiryDate < this.today) return 'Expired'; if (b.quantity === 0) return 'Out of stock'; if (b.expiryDate <= this.addDays(60)) return 'Near expiry'; return 'Available'; }
  private addDays(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
}
