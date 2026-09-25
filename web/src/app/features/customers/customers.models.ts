export interface Customer {
  id: number; name: string; phone?: string; email?: string; creditLimit: number; receivable: number; isActive: boolean;
}
export interface SaveCustomer { name: string; phone: string; email: string; creditLimit: number; }
export interface CustomerInvoice {
  id: number; invoiceNumber: string; createdAt: string; total: number; returned: number; paid: number;
  payments: { id: number; amount: number; method: string; reference?: string; paidAt: string }[];
}
export interface CustomerLedger {
  customer: Omit<Customer, 'receivable'>; receivable: number; invoices: CustomerInvoice[];
}
