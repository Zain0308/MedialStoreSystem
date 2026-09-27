# Project architecture

The application uses a **Modular Monolith**: one Node.js API deployment and one Angular application. Business capabilities stay organized by module.

- Active API: `api-node/src/modules/` (Node.js/Express).
- Frontend: `web/src/app/features/` (Angular).
- Turso control-plane database stores Application Owner accounts, store metadata, subscriptions, user assignments, roles and permissions.
- Each medical-store client has a separate Turso database for that store's business data. A client has one store at present; do not add branch support.
- Keep Turso platform tokens, database auth tokens, JWT secrets and encryption keys in backend environment variables. Never commit `.env` or credentials.
- Business routes must use the authenticated store selected from the signed token and load only that store's database. Never accept a client-supplied database URL/token.
- Keep stock and financial changes inside database transactions. Record stock movements for purchases, sales, returns and adjustments.
- Preserve the existing Angular feature ownership: each feature owns its pages, models, API service, routes and state. Shared transport/layout belongs in `web/src/app/core/` and reusable presentation helpers in `shared/`.
- `api/` contains the previous ASP.NET Core implementation as a migration reference while parity is verified. New backend work belongs in `api-node/`.
- Record unfinished behavior honestly; a module folder does not mean all workflows are complete.

Read `ARCHITECTURE.md` before changing tenant routing, authorization or persistence.
