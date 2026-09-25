# Customers

Status: implemented; registered from `MedicalStoreModules.cs`.

Scope: Customer records, customer selection at POS, unpaid invoices and receivables.

Owns store-scoped customer profiles, unpaid invoice statements and payment collection. POS requires a selected active customer whenever a sale has an outstanding balance, including partial payments. Initial partial tenders and later collections are both recorded against the invoice. Customer balances include payments, returns and remaining receivables; there is no per-customer credit limit.
