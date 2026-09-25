export interface PurchaseLine {
  medicineId: number;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
}
export interface CreatePurchase {
  supplierId: number;
  supplierInvoice: string;
  lines: PurchaseLine[];
}
export interface PurchaseResult {
  id: number;
  total: number;
}
export interface PurchaseHistory {
  id: number; supplier: string; supplierInvoice: string; createdAt: string; total: number;
  returnedTotal: number; paidTotal: number;
  lines: { id: number; medicine: string; batch: string; quantity: number; returnedQuantity: number; unitCost: number; onHand: number }[];
  returns: { id: number; supplierReference: string; reason: string; createdAt: string; total: number }[];
  payments: { id: number; amount: number; method: string; reference?: string; paidAt: string }[];
}
