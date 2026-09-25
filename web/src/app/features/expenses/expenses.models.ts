export interface ExpenseCategory { id: number; name: string; isActive: boolean; }
export interface Expense { id: number; categoryId: number; category: string; description: string; amount: number; expenseDate: string; paymentMethod: string; reference?: string; notes?: string; }
export interface SaveExpense { categoryId: number; description: string; amount: number; expenseDate: string; paymentMethod: string; reference: string; notes: string; }
