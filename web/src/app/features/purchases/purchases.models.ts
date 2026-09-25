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
