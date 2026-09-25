# Medical Store modules

This backend uses the agreed business module structure inside a single ASP.NET Core application and SQL Server database.

| Module folder | Current implementation | Pending scope |
| --- | --- | --- |
| Authentication | Owner login, user management, predefined/custom roles, permission claims and API authorization | Password reset/invitation flow and audit history |
| Medicines | Catalogue metadata, edit and soft deactivate/reactivate | Batch pricing is maintained through purchase lots |
| Inventory | Batch stock/expiry, audited adjustment and damage write-off, movement report | Multi-location stock |
| Purchases | Receive batches, history, supplier returns and invoice payments | Supplier-wide ledger and reconciliation |
| Sales | POS checkout, FEFO, discounts, cash/card/bank/mobile-wallet tender, returns and receipts | Customer credit and prescription workflow |
| Customers | Folder and implementation scope | Customer records, credit limits and receivables |
| Suppliers | Supplier records and creation | Edit/deactivate flows and supplier ledger |
| Expenses | Folder and implementation scope | Expense categories and expense entry |
| Reports | Dashboard summary endpoint | Detailed sales, inventory and profit reports; exports |

## File ownership

- Each business module keeps its endpoint handlers, request records, entities and EF model configurations together.
- `MedicalStoreModules.cs` registers implemented routes. Authentication login is anonymous; business routes share the authenticated `/api` group.
- `Infrastructure/Persistence/StoreDb.cs` owns the shared EF context and discovers module configurations. Table names, relationships and existing routes are preserved by this reorganization.
- `Infrastructure/DatabaseInitializer.cs` owns initial schema and owner-account setup.
- `Program.cs` owns host setup, dependency registration and middleware.

The endpoint style is Minimal API. The current Angular client consumes the same API routes. Customers and Expenses have no active endpoints yet; their folders document the next implementation work.
