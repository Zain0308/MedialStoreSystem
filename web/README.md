# Angular client

The frontend is organized by business feature under `src/app/features/`. Shared API transport is in `src/app/core/api/`.

## Local development

The API listens on `http://localhost:5080`; the Angular dev server proxies `/api` to it.

```bash
npm ci
npm start
```

Open `http://localhost:4200`. API calls use `public/app-config.json`. Leave `apiBaseUrl` empty for same-origin requests and the local proxy. For a separately hosted Node API, set it to that API's origin, for example `https://api.example.com`, and add the frontend origin to the API's `WEB_ORIGIN` allow list.

## Build and browser tests

```bash
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests use in-memory API fixtures and do not connect to Turso.
