export interface SaleSummary {
  id: number;
  invoiceNumber: string;
  createdAt: string;
  total: number;
  subtotal: number;
  discountAmount: number;
  paymentMethod: string;
  returnedTotal: number;
}
export interface Receipt {
  invoiceNumber: string;
  createdAt: string;
  total: number;
  cashReceived: number;
  subtotal: number;
  discountAmount: number;
  paymentMethod: string;
  returnedTotal: number;
  lines: { saleLineId: number; medicine: string; batch: string; quantity: number; returnedQuantity: number; unitPrice: number; discountAmount: number; total: number }[];
}
export interface CreateSale {
  lines: { medicineId: number; quantity: number }[];
  cashReceived: number;
  discountAmount: number;
  paymentMethod: string;
}
export interface SaleResult {
  id: number;
  invoiceNumber: string;
  total: number;
  subtotal: number;
  discountAmount: number;
  paymentMethod: string;
  change: number;
}
