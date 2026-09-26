# Architecture decision: Modular Monolith

This is the user-approved architecture for Medical Store. The system has one API deployment, one SQL Server database and one Angular frontend. Business capabilities are organized into modules inside those applications.

| Business module | Backend | Frontend | Current scope |
| --- | --- | --- | --- |
| Stores | `api/Modules/Stores` | Store selector and owner panel in `authentication` | Multiple isolated stores in one database, memberships, subscriptions, trials and store feature entitlements |
| Authentication | `api/Modules/Authentication` | `web/src/app/features/authentication` | Login, owner-only tenant administration, user accounts, password resets, roles and permissions |
| Medicines | `api/Modules/Medicines` | `web/src/app/features/medicines` | Catalogue metadata, editing and soft deactivation |
| Inventory | `api/Modules/Inventory` | `web/src/app/features/inventory` | Batch quantities, expiry tracking, audited adjustments, damaged stock and movement history |
| Purchases | `api/Modules/Purchases` | `web/src/app/features/purchases` | Receiving, history, audited quantity corrections, supplier returns and invoice payments |
| Sales / POS | `api/Modules/Sales` | `web/src/app/features/sales` | Cart, discounts, multiple tenders, partial and unpaid sales, receipts, returns and sales history |
| Customers | `api/Modules/Customers` | `web/src/app/features/customers` | Store-scoped records, paid/due totals, unpaid invoice ledger and payment collection |
| Suppliers | `api/Modules/Suppliers` | `web/src/app/features/suppliers` | Supplier contact details, edit/deactivation, search and purchase ledger |
| Expenses | `api/Modules/Expenses` | `web/src/app/features/expenses` | Store-scoped categories, expense entry and date/category filters |
| Reports | `api/Modules/Reports` | `web/src/app/features/reports` | Month-filtered profit and loss, supplier payables/credits, customer receivables, inventory valuation and CSV exports |

## Backend ownership

Each module owns its endpoints, request records, entities and EF configurations. The shared `StoreDb` composes those mappings. `Program.cs` configures the host; `MedicalStoreModules.cs` registers routes. The current transport style is Minimal API.

Business entities implement `IStoreScoped`. The active store comes from a signed token claim, is checked against the user's `UserStores` memberships, then enforced by EF Core query filters and `SaveChanges` stamping. Existing records and users are migrated into `Main Store`; new stores use separate `StoreId` partitions in the same SQL Server database.

The Application Owner is identified by the configured `Bootstrap:Email` account and receives a signed `app_owner` claim. Only this identity can use the `/owner` panel and global store/user-management APIs. Store staff cannot grant themselves owner access through roles or permissions. Store subscription status and expiry are checked during login and token validation; store feature entitlements are checked alongside each user's role permissions. Existing stores are grandfathered as active by `upgrade-v4.sql`.

## Frontend ownership

- `app.ts` renders the router outlet; `app.routes.ts` composes lazy feature routes.
- `core/layout` provides the authenticated shell. `core/api` provides HTTP transport and error formatting.
- Authentication owns the Application Owner panel and session state. The owner manages stores, trials/subscriptions, activation, store features, users, roles, user permissions and password resets. Permission policies are enforced by the API; the frontend also hides unavailable modules and management controls. Store Administrator access is fixed as a recovery role and does not grant Application Owner access.
- Each feature has its own route file, page components, templates, models and API service. Signals hold asynchronous page data and feedback.
- Public cross-feature dependencies go through `public-api.ts`, which exports API clients and models rather than pages or internal stores. For example, Purchases uses the public Medicines and Suppliers clients to populate its selectors.
- `shared/ui` contains presentation helpers only; it does not own catalogue, purchase or sales data.
- Sales owns the cart store and receipt component. The cart survives navigation and clears on logout or successful checkout. A receipt-loading failure after checkout must not leave a completed cart available for accidental resubmission.
- Feature-specific styles stay with their component. Common controls and print rules stay in `src/styles.css`.
- Customers and Expenses have separate lazy routes and store permissions; POS can look up active customers using its sales-create permission.

## Validation

Run `npm ci`, `npm run build`, `npx playwright install chromium` and `npm run test:e2e` from `web/`. Browser tests use in-memory API fixtures to exercise routing, login, user/role administration, permission-based UI, business forms, cart, checkout and receipts. They do not verify the .NET API or SQL Server transaction behavior.

At API startup, `EnsureCreated` creates a fresh SQL Server database if needed, then embedded idempotent `api/Database/upgrade-v*.sql` upgrades run in version order. The v2 upgrade adds feature columns/tables; v3 adds store memberships and `StoreId` to business tables, assigning existing rows/users to `Main Store`; v4 adds subscriptions, trial dates and store feature grants; v5 adds optional supplier contact details; v6 adds supplier activation, customer receivables and expense tables/permissions; v7 removes the retired customer credit limit; v8 adds audited purchase quantity corrections. Existing business rows are preserved.

GitHub Actions builds the API and frontend and runs the browser tests. Runtime verification against SQL Server remains a separate step.
