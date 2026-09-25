# Customers

Status: implemented with a lazy route protected by `customers.read`.

Scope: Customer records, POS customer selection, paid totals and receivables.

Owns customer profile management, activation, paid/due totals, unpaid invoice ledger and payment entry. POS reads active customer choices through the customer module's public API using the sales-create permission.
