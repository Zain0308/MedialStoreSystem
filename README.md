# Medical Store — working starter

ASP.NET Core 10 Web API, Angular 22, EF Core and SQL Server. This is an initial **single-store cash-sales MVP**, not yet a complete pharmacy deployment.

The API is a modular monolith with one API host and one SQL Server database. Business modules live under `api/Modules/`. Each implemented module owns its endpoints, request models, entities and EF configurations. `api/Infrastructure/Persistence/StoreDb.cs` provides the shared database context; `api/Program.cs` configures the host and registers modules. See [module structure and status](api/Modules/README.md).

## Implemented

- Owner login with ASP.NET Identity password hashing and short-lived JWT; API routes require login.
- Medicine and supplier creation, duplicate barcode check.
- Receive one batch line per purchase invoice; record stock movements.
- POS with barcode/name search, FEFO batch allocation, stock and expiry checks, cash sale, printable 80 mm receipt.
- Dashboard, batch inventory, expiry indicators, recent invoices.
- Purchase and sale stock changes run inside SQL transactions; sales use serializable isolation plus batch row versions.
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

The Windows account running the API must be allowed to access and create tables in the application database. For the first run, use an empty database: `EnsureCreated` creates the schema only when the database has no tables. It does not update an existing schema. Keep the connection string, JWT key and owner password private.

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

The first run creates the SQL schema and owner account. Existing owner passwords are **not** changed by later environment variable changes.

## Limits before real store rollout

The current app supports one store, one batch line per purchase invoice, and cash payments only. It does not yet support discounts, returns, customer credit, purchase payments, supplier ledger, user permissions, regulatory registers, backups or prescription validation. Money and quantity use per-unit amounts. POS's displayed total is an estimate if batches have different sale prices; the API computes the final FEFO amount. This version creates a fresh schema with `EnsureCreated`; before changing schema, add EF Core migrations and plan a database migration. Use HTTPS and secure secret storage in any deployment.

## API shape

`POST /api/auth/login`; authorized endpoints: `GET/POST /api/medicines`, `GET/POST /api/suppliers`, `GET /api/inventory`, `POST /api/purchases`, `POST /api/sales`, `GET /api/sales`, `GET /api/sales/{id}`, `GET /api/dashboard`.
