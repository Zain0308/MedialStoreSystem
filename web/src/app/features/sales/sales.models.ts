export interface SaleSummary {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  total: number;
}
export interface Receipt {
  invoiceNumber: string;
  createdAt: string;
  total: number;
  cashReceived: number;
  lines: { medicine: string; batch: string; quantity: number; unitPrice: number; total: number }[];
}
export interface CreateSale {
  lines: { medicineId: number; quantity: number }[];
  cashReceived: number;
}
export interface SaleResult {
  id: number;
  invoiceNumber: string;
  total: number;
  change: number;
}
