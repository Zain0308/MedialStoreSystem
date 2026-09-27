# Architecture: Medical Store SaaS

The agreed design is a modular monolith: a Node.js/Express API, an Angular client and Turso databases. Every customer currently operates one medical store. Branches are out of scope.

## Database ownership

| Data | Database |
| --- | --- |
| Application Owner, user accounts, store registry, subscriptions, user-store assignments, roles and permissions | One private control-plane database |
| Medicines, batches, stock movements, purchases, sales, customers, suppliers, expenses and reports | One separate Turso database per medical-store client |

The API resolves the selected store from the signed access token, verifies the user's assignment and subscription, then loads that store's database credentials from the control plane. Database tokens are encrypted at rest with `DATABASE_TOKEN_ENCRYPTION_KEY`. The browser never receives database credentials or the Turso Platform API token.

Store databases are provisioned using Turso's Platform API and initialized with `api-node/src/db/control-schema.js`. Schema changes must be versioned and applied to every existing tenant database. Keep cross-store reports in the control plane only when the report can be built without exposing tenant rows; the current API does not aggregate business data across stores.

## Backend module ownership

The active Node backend lives in `api-node/src/modules/`:

| Module | Responsibility |
| --- | --- |
| `authentication` | Login, sessions, store switching, owner-managed users, roles and permissions |
| `stores` | Store provisioning, status, subscriptions and feature permissions |
| `medicines` | Medicine catalogue, duplicates, edits and activation |
| `inventory` | Batch stock, expiry, movements, adjustments and damages |
| `purchases` | Supplier invoices, batches, payments, credits, returns and corrections |
| `sales` | POS, FEFO allocation, discounts, payment status, receipts and returns |
| `customers` | Customer accounts, ledgers, receivables and payments |
| `suppliers` | Supplier records and activation |
| `expenses` | Expense categories and entries |
| `reports` | Dashboard, profit and loss, payable/receivable ledgers, exports |
| `imports` | Spreadsheet template, preview and validated import |

`api-node/src/server.js` owns the HTTP host and middleware. `src/db/` owns database setup and tenant selection. Module routes enforce both user permission and store feature permission. Stock and financial writes must remain transactional; POS stock consumption follows FEFO and updates the stock movement ledger in the same transaction.

The prior ASP.NET Core project remains in `api/` as the API contract/reference while the Node port is checked. It is not the target runtime. Existing SQL Server rows are not automatically copied by this code; migrating the live data is a separate operation requiring source-database access and a tested export/import.

## Frontend ownership

- `app.ts` is the router outlet; `app.routes.ts` composes lazy feature routes.
- `core/api` owns HTTP transport and runtime API URL resolution.
- `core/layout` owns the authenticated shell.
- Each feature owns its routes, pages, models, API client and business state.
- Cross-feature dependencies use the feature's `public-api.ts`.
- `public/app-config.json` contains `apiBaseUrl`. Leave it empty for same-origin proxying; set it to the deployed Node API origin when the API is hosted separately.

## Validation

From `api-node/`: run `npm ci`, `npm run check` and `npm test`. Tests validate both schemas and an atomic stock decrement locally. Runtime integration tests against Turso still require deployment credentials.

From `web/`: run `npm ci`, `npm run build` and `npm run test:e2e`. Browser tests use API fixtures and do not verify live Turso transactions.
