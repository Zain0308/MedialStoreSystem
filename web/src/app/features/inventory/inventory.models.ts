export interface Batch {
  id: number;
  medicineId: number;
  medicine: string;
  number: string;
  expiryDate: string;
  costPrice: number;
  salePrice: number;
  quantity: number;
}
export interface StockMovement {
  id: number; batchId: number; medicine: string; batch: string; type: string;
  quantityChange: number; balanceAfter: number; reason: string; createdAt: string;
}
