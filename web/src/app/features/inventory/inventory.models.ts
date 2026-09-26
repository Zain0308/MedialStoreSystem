export interface Batch {
  id: number;
  medicineId: number;
  medicine: string;
  genericName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  number: string;
  expiryDate: string;
  costPrice: number;
  salePrice: number;
  quantity: number;
}
export interface ExpiryBatch {
  id: number;
  medicineId: number;
  medicine: string;
  batch: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  purchasedAt: string;
  supplier: string;
  supplierInvoice: string;
}
export interface StockMovement {
  id: number; batchId: number; medicine: string; batch: string; type: string;
  quantityChange: number; balanceAfter: number; reason: string; createdAt: string;
}
export interface InventoryMedicineDetails {
  medicine: { id: number; name: string; genericName?: string | null; barcode?: string | null; strength?: string | null;
    dosageForm?: string | null; manufacturer?: string | null; description?: string | null; minimumStock: number; isActive: boolean };
  batches: { id: number; number: string; expiryDate: string; costPrice: number; salePrice: number; quantity: number }[];
  purchases: { purchaseId: number; purchaseLineId: number; batchId: number; batch: string; supplier: string;
    supplierInvoice: string; purchasedAt: string; expiryDate: string; quantity: number; returnedQuantity: number;
    onHand: number; unitCost: number; salePrice: number; invoiceTotal: number; invoicePaid: number; invoiceReturned: number }[];
  payments: { id: number; supplierInvoice: string; supplier: string; amount: number; method: string; reference?: string; paidAt: string }[];
  returns: { id: number; supplierInvoice: string; supplier: string; supplierReference: string; reason: string;
    createdAt: string; quantity: number; unitCost: number; total: number }[];
  corrections: { id: number; supplierInvoice: string; batch: string; reason: string; createdAt: string;
    previousQuantity: number; correctedQuantity: number; quantityChange: number }[];
}
