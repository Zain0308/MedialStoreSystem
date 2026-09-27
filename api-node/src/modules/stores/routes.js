import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { controlDb } from '../../db/control.js';
import { createTenantDatabase, registerTenant, removeTenantDatabase } from '../../db/provision-store.js';
import { authenticate, clearPermissionCache, requireOwner } from '../../middleware/auth.js';
import { permissions } from '../../security/permissions.js';

const router = Router();
const ownerOnly = [authenticate, requireOwner];

router.get('/', authenticate, async (req, res) => {
  const { rows } = req.auth.isOwner
    ? await controlDb.execute(`SELECT id, name, code, 1 AS isDefault FROM stores WHERE is_active = 1 ORDER BY name`)
    : await controlDb.execute({
      sql: `SELECT s.id, s.name, s.code, us.is_default AS isDefault FROM user_stores us
        JOIN stores s ON s.id = us.store_id WHERE us.user_id = ? AND s.is_active = 1
        ORDER BY us.is_default DESC, s.name`, args: [req.auth.userId],
    });
  res.json(rows);
});

router.get('/all', ...ownerOnly, async (_req, res) => {
  const { rows: stores } = await controlDb.execute(`SELECT id, name, code, is_active AS isActive,
    subscription_plan AS subscriptionPlan, subscription_status AS subscriptionStatus,
    trial_ends_at AS trialEndsAt, subscription_expires_at AS subscriptionExpiresAt FROM stores ORDER BY name`);
  const { rows: grants } = await controlDb.execute('SELECT store_id AS storeId, permission_key AS permissionKey FROM store_permissions');
  res.json(stores.map((store) => ({ ...store, permissions: grants.filter((grant) => Number(grant.storeId) === Number(store.id)).map((grant) => grant.permissionKey) })));
});

router.post('/', ...ownerOnly, async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  if (name.length < 2 || name.length > 160) return res.status(400).json({ message: 'Store name must be 2–160 characters.' });
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) return res.status(400).json({ message: 'Store code must be 2–40 characters using letters, numbers, _ or -.' });
  const { rows: duplicate } = await controlDb.execute({ sql: 'SELECT id FROM stores WHERE code = ? COLLATE NOCASE', args: [code] });
  if (duplicate.length) return res.status(409).json({ message: 'Store code already exists.' });
  const databaseName = `${code.toLowerCase().replace(/_/g, '-')}-${randomUUID().slice(0, 8)}`.slice(0, 64);
  let database;
  try {
    database = await createTenantDatabase(databaseName);
    const store = await registerTenant({ name, code, database });
    await controlDb.execute({ sql: 'INSERT INTO user_stores(user_id, store_id, is_default) VALUES(?, ?, 0)', args: [req.auth.userId, store.id] });
    res.status(201).location(`/api/stores/${store.id}`).json({ ...store, isDefault: false });
  } catch (error) {
    if (database) await removeTenantDatabase(database.databaseName).catch(() => {});
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ message: 'Store code already exists.' });
    throw error;
  }
});

router.put('/:id/status', ...ownerOnly, async (req, res) => {
  const id = Number(req.params.id);
  const isActive = req.body?.isActive;
  if (!Number.isSafeInteger(id) || typeof isActive !== 'boolean') return res.status(400).json({ message: 'Set a valid store status.' });
  const { rows: target } = await controlDb.execute({ sql: 'SELECT id, is_active AS isActive, name, code FROM stores WHERE id = ?', args: [id] });
  if (!target.length) return res.sendStatus(404);
  if (!isActive && target[0].isActive) {
    const { rows } = await controlDb.execute('SELECT COUNT(*) AS count FROM stores WHERE is_active = 1');
    if (Number(rows[0].count) <= 1) return res.status(409).json({ message: 'At least one active store must remain.' });
  }
  await controlDb.execute({ sql: 'UPDATE stores SET is_active = ? WHERE id = ?', args: [isActive ? 1 : 0, id] });
  res.json({ ...target[0], isActive });
});

router.put('/:id/subscription', ...ownerOnly, async (req, res) => {
  const id = Number(req.params.id);
  const planName = String(req.body?.planName ?? '').trim();
  const status = String(req.body?.status ?? '').trim();
  const trialEndsAt = req.body?.trialEndsAt ?? null;
  const subscriptionExpiresAt = req.body?.subscriptionExpiresAt ?? null;
  if (!['Trial', 'Active', 'Suspended'].includes(status)) return res.status(400).json({ message: 'Status must be Trial, Active or Suspended.' });
  if (planName.length < 2 || planName.length > 80) return res.status(400).json({ message: 'Plan name must be 2–80 characters.' });
  if (status === 'Trial' && (!trialEndsAt || Date.parse(trialEndsAt) <= Date.now())) return res.status(400).json({ message: 'Set a future end date for the free trial.' });
  if (status === 'Active' && subscriptionExpiresAt && Date.parse(subscriptionExpiresAt) <= Date.now()) return res.status(400).json({ message: 'Subscription expiry must be in the future.' });
  const { rows } = await controlDb.execute({
    sql: `UPDATE stores SET subscription_plan = ?, subscription_status = ?, trial_ends_at = ?,
      subscription_expires_at = ? WHERE id = ? RETURNING id, subscription_plan AS subscriptionPlan,
      subscription_status AS subscriptionStatus, trial_ends_at AS trialEndsAt,
      subscription_expires_at AS subscriptionExpiresAt`,
    args: [planName, status, status === 'Trial' ? new Date(trialEndsAt).toISOString() : null,
      status === 'Active' && subscriptionExpiresAt ? new Date(subscriptionExpiresAt).toISOString() : null, id],
  });
  if (!rows.length) return res.sendStatus(404);
  res.json(rows[0]);
});

router.put('/:id/permissions', ...ownerOnly, async (req, res) => {
  const id = Number(req.params.id);
  const requested = [...new Set((Array.isArray(req.body?.permissions) ? req.body.permissions : []).map(String))];
  const invalid = requested.filter((key) => !permissions[key]);
  if (invalid.length) return res.status(400).json({ message: 'Unknown permission key.', permissions: invalid });
  const store = await controlDb.execute({ sql: 'SELECT id FROM stores WHERE id = ?', args: [id] });
  if (!store.rows.length) return res.sendStatus(404);
  const tx = await controlDb.transaction('write');
  try {
    const { rows: affectedUsers } = await tx.execute({ sql: 'SELECT user_id AS userId FROM user_stores WHERE store_id=?', args: [id] });
    await tx.execute({ sql: 'DELETE FROM store_permissions WHERE store_id = ?', args: [id] });
    for (const permissionKey of requested) await tx.execute({ sql: 'INSERT INTO store_permissions(store_id, permission_key) VALUES(?, ?)', args: [id, permissionKey] });
    await tx.commit();
    for (const user of affectedUsers) clearPermissionCache(user.userId);
  } catch (error) { await tx.rollback(); throw error; }
  res.json({ storeId: id, permissions: requested });
});

export default router;
