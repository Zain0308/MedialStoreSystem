# Medical Store — working starter

ASP.NET Core 9 Web API, Angular 22, EF Core and SQL Server. This is a multi-store pharmacy management MVP, not yet a complete pharmacy deployment.

The project uses **Modular Monolith** architecture: one API host, one SQL Server database and one Angular frontend. Business modules live under `api/Modules/` and `web/src/app/features/`. Each implemented feature owns its code, models and API interactions. See [architecture and ownership](ARCHITECTURE.md) and [backend module status](api/Modules/README.md).

## Implemented

- Owner login with ASP.NET Identity password hashing and short-lived JWT; API routes require login.
- Multiple user accounts, Administrator/Pharmacist/Cashier/Inventory Manager roles, custom roles, configurable permission claims, user activation and module-level API authorization.
- Medicine catalogue with generic name, strength, dosage form, manufacturer, description, edit and deactivate/reactivate (history is retained).
- Supplier creation and duplicate medicine-barcode check.
- Purchase history with supplier returns, outstanding invoice balances and cash/card/bank/mobile-wallet payments.
- Batch inventory with audited stock corrections, damaged-stock write-offs and movement history.
- POS with barcode/name search, FEFO batch allocation, discounts, cash/card/bank/mobile-wallet payments, sales returns and printable 80 mm receipts.
- Dashboard, batch inventory, expiry indicators, recent invoices.
- Purchase and sale stock changes run inside SQL transactions; sales use serializable isolation plus batch row versions.
- Multiple stores share one SQL Server database. Medicines, inventory, purchases, sales, suppliers and reports are partitioned by store. The Application Owner can manage stores, assign users, control subscriptions/trials, reset passwords and disable accounts; store customers do not have these controls.
- Users can switch only to assigned stores. Existing rows and users are assigned to `Main Store` by the automatic schema upgrade.
- Prescription-required medicines are blocked at POS until a proper prescription workflow exists.

## Requirements

- .NET SDK 10, Node.js 22+ and npm.
- SQL Server Express on Windows, or Docker with Compose for a separate SQL Server instance.

## Run on Windows with your SQL Server Express

Set the connection string in your PowerShell session using your own SQL Server instance and application database. Do not use SQL Server's `master` system database. Keep the connection details out of the public repository.

```powershell
cd api
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__Store = 'Server=YOUR_SERVER;Database=YOUR_DATABASE;Integrated Security=True;Encrypt=True;TrustServerCertificate=True'
$env:Jwt__Key = 'generate-a-random-secret-with-at-least-32-bytes'
$env:Bootstrap__Email = 'owner@example.com'
$env:Bootstrap__Password = 'choose-a-unique-strong-owner-password!'
dotnet restore
dotnet run --urls http://localhost:5080
```

The Windows account running the API must be allowed to create and alter tables in the application database. For a fresh database, `EnsureCreated` creates the schema. At API startup, embedded idempotent `api/Database/upgrade-v*.sql` upgrades run automatically, adding missing columns/tables to existing databases while preserving rows. Keep the connection string, JWT key and owner password private.

In a second PowerShell terminal:

```powershell
cd web
npm ci
npm start
```

Visit `http://localhost:4200` and sign in with the owner credentials you set.

## Alternative: run SQL Server with Docker

From this folder in a terminal:

```bash
export SQL_SA_PASSWORD='choose-a-strong-SQL-password'
docker compose up -d
```

Use a unique SQL password that satisfies SQL Server password policy. Then start the backend with your actual credentials. In another terminal:

```bash
cd api
export ConnectionStrings__Store='Server=localhost,1433;Database=MedicalStore;User Id=sa;Password=YOUR_SQL_PASSWORD;TrustServerCertificate=True'
export Jwt__Key='generate-a-random-secret-with-at-least-32-bytes'
export Bootstrap__Email='owner@example.com'
export Bootstrap__Password='choose-a-unique-strong-owner-password!'
dotnet restore
dotnet run --urls http://localhost:5080
```

Open another terminal:

```bash
cd web
npm ci
npm start
```

Visit `http://localhost:4200` and sign in with the `Bootstrap__Email` and `Bootstrap__Password` you set. Create a medicine and supplier, receive a batch, then create a sale. `GET http://localhost:5080/api/health` checks whether the API has started.

The first run creates the SQL schema and owner account. On each API startup, the idempotent `api/Database/upgrade-v2.sql` schema upgrade is also applied automatically, so existing databases receive the missing feature columns/tables without deleting rows. Existing owner passwords are **not** changed by later environment variable changes.

The Application Owner account is the identity whose email matches `Bootstrap__Email`. Sign in with that account and open **Owner panel**. Store Administrator roles do not grant access to this panel or its APIs. Existing stores are grandfathered as active when the v4 schema upgrade runs.

## Limits before real store rollout

The purchase screen receives one batch line at a time. Customer credit, a consolidated supplier ledger, self-service password reset/invitations, regulatory registers, backups and prescription validation are not implemented. POS's displayed total is an estimate if batches have different sale prices; the API computes the final FEFO amount. Keep the API connection string pointed at the shared `MedicalStoreSystem` database. Use HTTPS and secure secret storage in any deployment.

## API shape

`POST /api/auth/login`; Application Owner-only endpoints manage `/api/auth/users`, `/api/auth/roles` and `/api/stores/all`, including account status, password reset, store subscriptions, feature permissions and activation. Medicine endpoints include `GET/POST /api/medicines`, `PUT /api/medicines/{id}`, and `PUT /api/medicines/{id}/status`. Inventory endpoints include `GET /api/inventory`, `POST /api/inventory/adjustments`, and `GET /api/inventory/movements`. Purchases expose `GET/POST /api/purchases`, `POST /api/purchases/{id}/returns`, and `POST /api/purchases/{id}/payments`. Sales expose `POST/GET /api/sales`, `GET /api/sales/{id}`, and `POST /api/sales/{id}/returns`. Business endpoints are protected by module permission policies and store entitlements.
