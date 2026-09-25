# Project architecture

The user selected **Modular Monolith** for this project. Preserve this decision in future work.

- Keep one ASP.NET Core API host, one SQL Server database and one Angular application.
- Organize business code into Authentication, Medicines, Inventory, Purchases, Sales/POS, Customers, Suppliers, Expenses and Reports.
- Backend modules live under `api/Modules/`; frontend features live under `web/src/app/features/`.
- Each frontend feature owns its pages, models, API service, routes and business state. Do not move all feature state or requests into the root component or a shared store service.
- Cross-feature frontend dependencies must use the feature's `public-api.ts`. Pages and internal state stores are private to their feature.
- Keep `app.ts` as the Angular bootstrap outlet. Keep shared transport/layout in `core/` and reusable presentation helpers in `shared/`.
- Record unfinished modules honestly; a folder does not imply a working feature.
- Read `ARCHITECTURE.md` for ownership and validation instructions.
