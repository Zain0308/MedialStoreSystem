# Medical Store modules

This backend uses the agreed business module structure inside a single ASP.NET Core application and SQL Server database.

| Module folder | Current implementation | Pending scope |
| --- | --- | --- |
| Stores | Store creation, per-user membership, active-store switching and tenant-scoped business data in one database | Store editing/deactivation and store-specific role definitions |
| Authentication | Owner login, user management, predefined/custom roles, permission claims and API authorization | Password reset/invitation flow and audit history |
| Medicines | Catalogue metadata, edit and soft deactivate/reactivate | Batch pricing is maintained through purchase lots |
| Inventory | Batch stock/expiry, audited adjustment and damage write-off, movement report | Multi-location stock |
| Purchases | Receive batches, history, supplier returns, invoice payments and supplier-wide statements | Reconciliation |
| Sales | POS checkout, FEFO, discounts, cash/card/bank/mobile-wallet/Not Received tender, returns and receipts | Prescription workflow |
| Customers | Store-scoped records, paid and receivable totals, unpaid invoice ledger, payment collection and account status | Customer-specific pricing |
| Suppliers | Supplier records/contact details, edit/deactivate, search and purchase ledger | Reconciliation |
| Expenses | Store-scoped categories, expense entries and date/category filters | Recurring expenses |
| Reports | Dashboard, sales detail, inventory valuation, expenses, estimated profit and CSV exports | PDF/Excel exports |

## File ownership

- Each business module keeps its endpoint handlers, request records, entities and EF model configurations together.
- `MedicalStoreModules.cs` registers implemented routes. Authentication login is anonymous; business routes share the authenticated `/api` group.
- `Infrastructure/Persistence/StoreDb.cs` owns the shared EF context and discovers module configurations. Table names, relationships and existing routes are preserved by this reorganization.
- `Infrastructure/DatabaseInitializer.cs` owns initial schema and owner-account setup.
- `Program.cs` owns host setup, dependency registration and middleware.

The endpoint style is Minimal API. The current Angular client consumes the same API routes. Every customer, payment, category and expense record is store-scoped. A Not Received checkout requires a selected active customer and adds the unpaid invoice balance to that customer's receivables.
