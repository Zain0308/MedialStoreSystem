export interface Dashboard {
  todaySales: number;
  todayInvoices: number;
  medicineCount: number;
  expiringBatches: number;
  expiredBatches: number;
}
export interface DetailedReport {
  from: string | null; to: string | null; netSales: number; costOfGoods: number; expenseTotal: number; netProfit: number;
  returnedTotal: number; inventoryCostValue: number; inventorySaleValue: number;
  sales: { invoiceNumber: string; createdAt: string; customer?: string; paymentMethod: string; subtotal: number; discountAmount: number; total: number; returned: number; cost: number; netSales: number }[];
  inventory: { medicine: string; batch: string; expiryDate: string; quantity: number; costPrice: number; salePrice: number; costValue: number; saleValue: number }[];
  expenses: { expenseDate: string; category: string; description: string; paymentMethod: string; reference?: string; amount: number }[];
}
