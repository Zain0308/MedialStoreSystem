# Architecture decision: Modular Monolith

This is the user-approved architecture for Medical Store. The system has one API deployment, one SQL Server database and one Angular frontend. Business capabilities are organized into modules inside those applications.

| Business module | Backend | Frontend | Current scope |
| --- | --- | --- | --- |
| Stores | `api/Modules/Stores` | Store selector and administration in `authentication` | Multiple stores in one database, user memberships and active-store selection |
| Authentication | `api/Modules/Authentication` | `web/src/app/features/authentication` | Login, multi-user administration, roles, permissions and route/API authorization |
| Medicines | `api/Modules/Medicines` | `web/src/app/features/medicines` | Catalogue metadata, editing and soft deactivation |
| Inventory | `api/Modules/Inventory` | `web/src/app/features/inventory` | Batch quantities, audited adjustments, damaged stock and movement history |
| Purchases | `api/Modules/Purchases` | `web/src/app/features/purchases` | Receiving, history, supplier returns and invoice payments |
| Sales / POS | `api/Modules/Sales` | `web/src/app/features/sales` | Cart, discounts, multiple tenders, receipts, returns and sales history |
| Customers | `api/Modules/Customers` | `web/src/app/features/customers` | Planned; functionality pending |
| Suppliers | `api/Modules/Suppliers` | `web/src/app/features/suppliers` | Supplier list and creation |
| Expenses | `api/Modules/Expenses` | `web/src/app/features/expenses` | Planned; functionality pending |
| Reports | `api/Modules/Reports` | `web/src/app/features/reports` | Dashboard; detailed reports pending |

## Backend ownership

Each module owns its endpoints, request records, entities and EF configurations. The shared `StoreDb` composes those mappings. `Program.cs` configures the host; `MedicalStoreModules.cs` registers routes. The current transport style is Minimal API.

Business entities implement `IStoreScoped`. The active store comes from a signed token claim, is checked against the user's `UserStores` memberships, then enforced by EF Core query filters and `SaveChanges` stamping. Existing records and users are migrated into `Main Store`; new stores use separate `StoreId` partitions in the same SQL Server database.

## Frontend ownership

- `app.ts` renders the router outlet; `app.routes.ts` composes lazy feature routes.
- `core/layout` provides the authenticated shell. `core/api` provides HTTP transport and error formatting.
- Authentication owns user and role management. Permission policies are enforced by the API; the frontend also hides unavailable modules and management controls. Administrator access is fixed as a recovery role.
- Each feature has its own route file, page components, templates, models and API service. Signals hold asynchronous page data and feedback.
- Public cross-feature dependencies go through `public-api.ts`, which exports API clients and models rather than pages or internal stores. For example, Purchases uses the public Medicines and Suppliers clients to populate its selectors.
- `shared/ui` contains presentation helpers only; it does not own catalogue, purchase or sales data.
- Sales owns the cart store and receipt component. The cart survives navigation and clears on logout or successful checkout. A receipt-loading failure after checkout must not leave a completed cart available for accidental resubmission.
- Feature-specific styles stay with their component. Common controls and print rules stay in `src/styles.css`.
- Customers and Expenses are documented feature directories without registered routes until implemented.

## Validation

Run `npm ci`, `npm run build`, `npx playwright install chromium` and `npm run test:e2e` from `web/`. Browser tests use in-memory API fixtures to exercise routing, login, user/role administration, permission-based UI, business forms, cart, checkout and receipts. They do not verify the .NET API or SQL Server transaction behavior.

At API startup, `EnsureCreated` creates a fresh SQL Server database if needed, then embedded idempotent `api/Database/upgrade-v*.sql` upgrades run in version order. The v2 upgrade adds feature columns/tables; v3 adds store memberships and `StoreId` to business tables, assigning existing rows/users to `Main Store`. Existing business rows are preserved.

GitHub Actions builds the API and frontend and runs the browser tests. Runtime verification against SQL Server remains a separate step.
