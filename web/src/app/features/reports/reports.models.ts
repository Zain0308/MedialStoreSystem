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
export interface PayablesReport {
  payableTotal: number;
  supplierCreditTotal: number;
  suppliers: {
    supplierId: number; supplier: string; invoiceCount: number; purchaseTotal: number; returnedTotal: number;
    paidTotal: number; balance: number; payableAmount: number; receivableAmount: number;
    invoices: {
      id: number; supplierInvoice: string; createdAt: string; total: number; returned: number; paid: number; balance: number;
      returns: { createdAt: string; supplierReference: string; reason: string; amount: number }[];
      payments: { paidAt: string; amount: number; method: string; reference?: string }[];
    }[];
  }[];
}
export interface ReceivablesReport {
  totalReceivable: number;
  customers: {
    customerId: number; customer: string; phone?: string; email?: string; isActive: boolean;
    paidTotal: number; amountDue: number; invoiceCount: number;
    invoices: {
      id: number; invoiceNumber: string; createdAt: string; total: number; returned: number; paid: number; due: number;
      payments: { paidAt: string; amount: number; method: string; reference?: string }[];
    }[];
  }[];
}
