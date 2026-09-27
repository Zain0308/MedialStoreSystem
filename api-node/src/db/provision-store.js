import { env } from '../config/env.js';
import { tenantSchema } from './control-schema.js';
import { createClient } from '@libsql/client';
import { createClient as createTursoPlatformClient } from '@tursodatabase/api';
import { encryptSecret } from '../security/secrets.js';
import { controlDb } from './control.js';
import { defaultRoles, permissions } from '../security/permissions.js';

const platform = createTursoPlatformClient({ org: env.TURSO_ORGANIZATION, token: env.TURSO_PLATFORM_TOKEN });

export async function createTenantDatabase(databaseName) {
  await platform.databases.create(databaseName, { group: env.TURSO_GROUP });
  try {
    const [database, { jwt: authToken }] = await Promise.all([
      platform.databases.get(databaseName),
      platform.databases.createToken(databaseName, { authorization: 'full-access' }),
    ]);
    const dbUrl = `libsql://${database.hostname}`;
    if (!authToken || !database.hostname) throw new Error('Turso did not return the new database credentials.');
    const client = createClient({ url: dbUrl, authToken });
    try {
      await client.execute('PRAGMA foreign_keys = ON');
      await client.batch(tenantSchema.map((sql) => ({ sql })), 'write');
      await client.execute({ sql: 'INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)', args: [new Date().toISOString()] });
    } finally { await client.close(); }
    return { databaseName, databaseUrl: dbUrl, databaseTokenCiphertext: encryptSecret(authToken) };
  } catch (error) {
    await platform.databases.delete(databaseName).catch(() => {});
    throw error;
  }
}

export async function removeTenantDatabase(databaseName) {
  await platform.databases.delete(databaseName);
}

export async function registerTenant({ name, code, database }) {
  const trialEndsAt = new Date(Date.now() + 14 * 86400_000).toISOString();
  const tx = await controlDb.transaction('write');
  try {
    const result = await tx.execute({
      sql: `INSERT INTO stores(name, code, subscription_plan, subscription_status, trial_ends_at,
        database_name, database_url, database_token_ciphertext)
        VALUES(?, ?, 'Trial', 'Trial', ?, ?, ?, ?) RETURNING id, name, code`,
      args: [name, code, trialEndsAt, database.databaseName, database.databaseUrl, database.databaseTokenCiphertext],
    });
    const store = result.rows[0];
    for (const [roleName, permissionKeys] of Object.entries(defaultRoles)) {
      const roleResult = await tx.execute({
        sql: 'INSERT INTO roles(store_id, name, is_system) VALUES(?, ?, 1) RETURNING id',
        args: [store.id, roleName],
      });
      const roleId = roleResult.rows[0].id;
      for (const permissionKey of permissionKeys) {
        await tx.execute({ sql: 'INSERT INTO role_permissions(role_id, permission_key) VALUES(?, ?)', args: [roleId, permissionKey] });
      }
    }
    for (const permissionKey of Object.keys(permissions)) {
      await tx.execute({ sql: 'INSERT INTO store_permissions(store_id, permission_key) VALUES(?, ?)', args: [store.id, permissionKey] });
    }
    await tx.commit();
    return store;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}
