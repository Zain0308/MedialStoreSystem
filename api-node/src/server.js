import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { allowedWebOrigins, env, isProduction } from './config/env.js';
import { controlDb, initializeControlDatabase } from './db/control.js';
import { closeTenantClients } from './db/tenant.js';
import authenticationRoutes from './modules/authentication/routes.js';
import storeRoutes from './modules/stores/routes.js';
import medicineRoutes from './modules/medicines/routes.js';
import supplierRoutes from './modules/suppliers/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import purchaseRoutes from './modules/purchases/routes.js';
import salesRoutes from './modules/sales/routes.js';
import customerRoutes from './modules/customers/routes.js';
import expenseRoutes from './modules/expenses/routes.js';
import reportRoutes from './modules/reports/routes.js';
import importRoutes from './modules/imports/routes.js';

await initializeControlDatabase();

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedWebOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by API CORS policy.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', async (_req, res, next) => {
  try {
    await controlDb.execute('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) { next(error); }
});
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/auth', authenticationRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/imports', importRoutes);
app.use('/api', reportRoutes);

app.use('/api', (_req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use((error, _req, res, _next) => {
  if (!isProduction) console.error(error);
  if (res.headersSent) return;
  const status = Number(error?.status) || 500;
  res.status(status).json({ message: status < 500 ? error.message : 'The request could not be completed.' });
});

const server = app.listen(env.PORT, () => {
  console.log(`Medical Store API listening on port ${env.PORT}`);
});

async function shutdown() {
  server.close();
  await closeTenantClients();
  await controlDb.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, server };
