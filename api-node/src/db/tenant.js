import { createClient } from '@libsql/client';
import { tenantSchema } from './control-schema.js';
import { decryptSecret } from '../security/secrets.js';
import { controlDb } from './control.js';

const clients = new Map();

export async function getStoreRecord(storeId) {
  const result = await controlDb.execute({
    sql: `SELECT id, name, code, is_active AS isActive, subscription_plan AS subscriptionPlan,
      subscription_status AS subscriptionStatus, trial_ends_at AS trialEndsAt,
      subscription_expires_at AS subscriptionExpiresAt, database_url AS databaseUrl,
      database_token_ciphertext AS databaseTokenCiphertext
      FROM stores WHERE id = ?`,
    args: [storeId],
  });
  return result.rows[0] ?? null;
}

export async function getTenantDb(store) {
  const existing = clients.get(Number(store.id));
  if (existing) return existing;
  const authToken = decryptSecret(store.databaseTokenCiphertext);
  const client = createClient({ url: store.databaseUrl, authToken });
  await client.execute('PRAGMA foreign_keys = ON');
  for (const statement of tenantSchema) await client.execute(statement);
  await client.execute({
    sql: 'INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)',
    args: [new Date().toISOString()],
  });
  clients.set(Number(store.id), client);
  return client;
}

export async function closeTenantClients() {
  await Promise.all([...clients.values()].map((client) => client.close()));
  clients.clear();
}
