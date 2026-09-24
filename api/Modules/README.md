# Medical Store modules

This backend uses the agreed business module structure inside a single ASP.NET Core application and SQL Server database.

| Module folder | Current implementation | Pending scope |
| --- | --- | --- |
| Authentication | Owner login, Identity user, JWT configuration | Additional users, roles and permissions |
| Medicines | Medicine catalogue, creation and barcode checks | Edit/deactivate flows and additional medicine metadata |
| Inventory | Batch stock, expiry data and stock movement entities | Adjustments, damaged stock handling and movement reports |
| Purchases | Receive purchases and record stock increases | Purchase history, returns and supplier payments |
| Sales | POS checkout, FEFO allocation, sales history and receipts | Returns, discounts and additional payment methods |
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
