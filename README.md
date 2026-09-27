# Medical Store System

Angular 22 frontend and a modular Node.js API backed by Turso. The Application Owner's control data lives in one private control-plane database; each medical-store client has its own isolated business database. One store per client is in scope; branches are not implemented.

The previous ASP.NET Core/SQL Server API remains under `api/` as a migration reference while the Node implementation is reviewed. The active API is `api-node/`. See [the architecture](ARCHITECTURE.md) for module boundaries and tenant isolation.

## Start the API

Create a control-plane Turso database and a Platform API token in Turso. The database auth token you shared earlier only grants access to one database; it cannot create tenant databases. Store all credentials in the API host environment, never in Angular or committed files.

```bash
cd api-node
cp .env.example .env
```

Set these values in `api-node/.env` or the backend host's environment:

- `TURSO_CONTROL_DATABASE_URL` and `TURSO_CONTROL_AUTH_TOKEN`: a dedicated control-plane database. Keep it separate from all store databases.
- `TURSO_PLATFORM_TOKEN`, `TURSO_ORGANIZATION`, and `TURSO_GROUP`: used to provision each store's database.
- `JWT_SECRET`: at least 32 random bytes.
- `DATABASE_TOKEN_ENCRYPTION_KEY`: a base64-encoded 32-byte key (`openssl rand -base64 32`).
- `OWNER_EMAIL` and `BOOTSTRAP_OWNER_PASSWORD`: initial Application Owner login. Use a unique password with at least 12 characters and a symbol.
- `WEB_ORIGIN`: comma-separated allowed frontend origins, for example `http://localhost:4200,https://your-app.vercel.app`.

On first start, the API provisions a trial store database unless `BOOTSTRAP_STORE_DATABASE_URL` and `BOOTSTRAP_STORE_AUTH_TOKEN` are set to an already-created, separate tenant database. The Application Owner account is created once from the bootstrap settings. Later changes to the environment password do not reset it.

```bash
npm ci
npm run dev
```

The API listens on port `5080`. `GET http://localhost:5080/api/health` checks the control-plane database. New store databases are created by the owner panel through Turso's Platform API. The Turso group must already exist in the desired region.

## Start the Angular app

```bash
cd web
npm ci
npm start
```

Visit `http://localhost:4200`. The development proxy forwards `/api` requests to `http://localhost:5080`. For separate frontend/API hosting, set `web/public/app-config.json`'s `apiBaseUrl` to the Node API origin and configure that API's `WEB_ORIGIN` to allow the frontend domain. Do not put a database URL or database token in this file.

## Verification

```bash
cd api-node
npm run check
npm test
```

```bash
cd web
npm run build
npm run test:e2e
```

The tests use local SQLite for schema/transaction checks and browser API fixtures. They do not validate live Turso credentials, SQL Server-to-Turso data transfer, or deployed CORS settings.

## Existing data

Moving the API code does not copy records from the existing SQL Server into Turso. That requires access to the source SQL Server and a reviewed migration/export for store users, medicines, batches, purchases, sales, balances and audit history. Do not point the control-plane URL and a tenant URL at the same Turso database.

The Turso auth token shared in chat should be revoked and replaced before production use. It is intentionally not included in this repository.
