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
  supplierCreditApplied?: number;
}
export interface PurchaseHistory {
  id: number; supplier: string; supplierInvoice: string; createdAt: string; total: number;
  returnedTotal: number; paidTotal: number;
  lines: { id: number; medicine: string; batch: string; quantity: number; returnedQuantity: number; unitCost: number; onHand: number }[];
  returns: { id: number; supplierReference: string; reason: string; createdAt: string; total: number }[];
  payments: { id: number; amount: number; method: string; reference?: string; paidAt: string }[];
  corrections?: PurchaseCorrectionHistory[];
}
export interface SupplierAccountSummary {
  supplierId: number;
  supplier: string;
  invoiceCount: number;
  purchaseTotal: number;
  returnedTotal: number;
  paidTotal: number;
  balance: number;
}
export interface SupplierStatement {
  supplierId: number;
  supplier: string;
  invoices: PurchaseHistory[];
}
export interface PurchaseCorrectionHistory {
  id: number; reason: string; actorId?: string; createdAt: string; previousTotal: number; correctedTotal: number;
  lines: { purchaseLineId: number; medicine: string; batch: string; previousQuantity: number; correctedQuantity: number; quantityChange: number }[];
}
