# ASP.NET Core migration reference

The source in this folder is the previous API implementation. The active backend is the Node.js modular monolith in `api-node/src/modules/`.

Use these Minimal API endpoints and domain rules as a reference while reviewing Node/API parity. The Angular application still consumes the same `/api` routes. Do not add new production behavior here.

This SQL Server project does not automatically transfer existing rows to Turso. A separate, reviewed data migration is required before replacing a live deployment.
