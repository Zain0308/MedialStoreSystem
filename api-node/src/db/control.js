import { createClient } from '@libsql/client';
import { controlSchema } from './control-schema.js';
import { env } from '../config/env.js';
import { hashPassword } from '../security/passwords.js';
import { createTenantDatabase, registerTenant } from './provision-store.js';

export const controlDb = createClient({
  url: env.TURSO_CONTROL_DATABASE_URL,
  authToken: env.TURSO_CONTROL_AUTH_TOKEN,
});

export async function initializeControlDatabase() {
  if (env.BOOTSTRAP_STORE_DATABASE_URL && env.BOOTSTRAP_STORE_DATABASE_URL === env.TURSO_CONTROL_DATABASE_URL) {
    throw new Error('The control database and first store database must be different databases.');
  }
  await controlDb.execute('PRAGMA foreign_keys = ON');
  await controlDb.batch(controlSchema.map((sql) => ({ sql })), 'write');
  await controlDb.execute({
    sql: 'INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)',
    args: [new Date().toISOString()],
  });
  const storeCount = await controlDb.execute('SELECT COUNT(*) AS count FROM stores');
  let store = null;
  if (Number(storeCount.rows[0].count) === 0) {
    if (env.BOOTSTRAP_STORE_DATABASE_URL && env.BOOTSTRAP_STORE_AUTH_TOKEN) {
      const { encryptSecret } = await import('../security/secrets.js');
      const databaseName = new URL(env.BOOTSTRAP_STORE_DATABASE_URL.replace('libsql://', 'https://')).hostname.split('.')[0];
      store = await registerTenant({
        name: env.BOOTSTRAP_STORE_NAME,
        code: env.BOOTSTRAP_STORE_CODE,
        database: {
          databaseName,
          databaseUrl: env.BOOTSTRAP_STORE_DATABASE_URL,
          databaseTokenCiphertext: encryptSecret(env.BOOTSTRAP_STORE_AUTH_TOKEN),
        },
      });
    } else {
      if (!env.BOOTSTRAP_OWNER_PASSWORD || env.BOOTSTRAP_OWNER_PASSWORD.length < 12) {
        throw new Error('Set BOOTSTRAP_OWNER_PASSWORD (12+ characters) before the first start.');
      }
      const databaseName = `${env.BOOTSTRAP_STORE_CODE.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${Date.now().toString(36)}`.slice(0, 64);
      const database = await createTenantDatabase(databaseName);
      store = await registerTenant({ name: env.BOOTSTRAP_STORE_NAME, code: env.BOOTSTRAP_STORE_CODE, database });
    }
  } else {
    const first = await controlDb.execute('SELECT id, database_url AS databaseUrl FROM stores ORDER BY id LIMIT 1');
    const collision = await controlDb.execute({ sql: 'SELECT COUNT(*) AS count FROM stores WHERE database_url = ?', args: [env.TURSO_CONTROL_DATABASE_URL] });
    if (Number(collision.rows[0].count) > 0) throw new Error('A store database points to the control database; this would mix platform and store data.');
    store = first.rows[0] ?? null;
  }
  const owner = await controlDb.execute({ sql: 'SELECT id FROM users WHERE email = ? COLLATE NOCASE', args: [env.OWNER_EMAIL] });
  if (!owner.rows.length) {
    if (!env.BOOTSTRAP_OWNER_PASSWORD || env.BOOTSTRAP_OWNER_PASSWORD.length < 12) {
      throw new Error('Set BOOTSTRAP_OWNER_PASSWORD (12+ characters) to create the Application Owner account.');
    }
    const userId = crypto.randomUUID();
    await controlDb.execute({
      sql: 'INSERT INTO users(id, email, password_hash, is_active) VALUES(?, ?, ?, 1)',
      args: [userId, env.OWNER_EMAIL, await hashPassword(env.BOOTSTRAP_OWNER_PASSWORD)],
    });
    if (store?.id) await controlDb.execute({
      sql: 'INSERT OR IGNORE INTO user_stores(user_id, store_id, is_default) VALUES(?, ?, 1)',
      args: [userId, store.id],
    });
  }
}

export async function closeControlDatabase() {
  await controlDb.close();
}
