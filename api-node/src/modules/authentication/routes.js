import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { controlDb } from '../../db/control.js';
import { authenticate, clearPermissionCache, createSession, requireOwner } from '../../middleware/auth.js';
import { defaultRoles, permissions } from '../../security/permissions.js';
import { hashPassword, validatePassword, verifyPassword } from '../../security/passwords.js';

const router = Router();
const ownerOnly = [authenticate, requireOwner];
const roleNamePattern = /^[A-Za-z0-9][A-Za-z0-9 _-]{2,39}$/;

async function permissionSnapshot(userId, storeId, isOwner) {
  if (!storeId) return { roles: [], permissions: [] };
  const { rows } = await controlDb.execute({
    sql: `SELECT DISTINCT r.name AS roleName, rp.permission_key AS permissionKey
      FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE ur.user_id = ? AND ur.store_id = ? ORDER BY r.name, rp.permission_key`,
    args: [userId, storeId],
  });
  return {
    roles: [...new Set(rows.map((row) => row.roleName))],
    permissions: isOwner ? Object.keys(permissions) : [...new Set(rows.map((row) => row.permissionKey).filter(Boolean))].sort(),
  };
}

async function sessionPayload(user, storeId, isOwner) {
  const token = await createSession(user, storeId, isOwner);
  const [scope, membershipResult] = await Promise.all([
    permissionSnapshot(user.id, storeId, isOwner),
    controlDb.execute({
      sql: `SELECT s.id AS id, s.name AS name, s.code AS code, us.is_default AS isDefault
        FROM user_stores us JOIN stores s ON s.id = us.store_id
        WHERE us.user_id = ? AND s.is_active = 1 ORDER BY us.is_default DESC, s.name`,
      args: [user.id],
    }),
  ]);
  const { rows: selectedResult } = storeId ? await controlDb.execute({
    sql: 'SELECT subscription_status AS status, trial_ends_at AS trialEndsAt, subscription_expires_at AS expiry FROM stores WHERE id = ?',
    args: [storeId],
  }) : { rows: [] };
  const selected = selectedResult[0];
  const expiry = selected?.status === 'Trial' ? selected.trialEndsAt : selected?.expiry;
  return {
    token,
    userId: user.id,
    email: user.email,
    roles: scope.roles,
    permissions: scope.permissions,
    activeStoreId: storeId,
    stores: membershipResult.rows,
    isApplicationOwner: isOwner,
    subscriptionExpired: Boolean(expiry && Date.parse(expiry) <= Date.now()),
    subscriptionExpiresAt: expiry ?? null,
  };
}

router.post('/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(401).json({ message: 'Email or password is incorrect.' });
  const { rows } = await controlDb.execute({
    sql: `SELECT id, email, password_hash AS passwordHash, is_active AS isActive,
      failed_login_count AS failedLoginCount, locked_until AS lockedUntil,
      security_version AS securityVersion FROM users WHERE email = ? COLLATE NOCASE`,
    args: [email],
  });
  const user = rows[0];
  if (!user || !user.isActive || (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now())) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const count = Number(user.failedLoginCount) + 1;
    const lockedUntil = count >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await controlDb.execute({
      sql: 'UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?',
      args: [lockedUntil ? 0 : count, lockedUntil, user.id],
    });
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  await controlDb.execute({ sql: 'UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?', args: [user.id] });
  const isOwner = user.email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase();
  const { rows: memberships } = await controlDb.execute({
    sql: `SELECT s.id, s.subscription_status AS subscriptionStatus, s.trial_ends_at AS trialEndsAt,
      s.subscription_expires_at AS subscriptionExpiresAt, s.is_active AS isActive, us.is_default AS isDefault
      FROM user_stores us JOIN stores s ON s.id = us.store_id
      WHERE us.user_id = ? AND s.is_active = 1 ORDER BY us.is_default DESC, s.name`,
    args: [user.id],
  });
  const activeMembership = memberships.find((store) => {
    const expiry = store.subscriptionStatus === 'Trial' ? store.trialEndsAt : store.subscriptionExpiresAt;
    return (store.subscriptionStatus === 'Active' || store.subscriptionStatus === 'Trial') && (!expiry || Date.parse(expiry) > Date.now());
  });
  const expiredMembership = memberships.find((store) => {
    const expiry = store.subscriptionStatus === 'Trial' ? store.trialEndsAt : store.subscriptionExpiresAt;
    return expiry && Date.parse(expiry) <= Date.now();
  });
  const selected = activeMembership ?? (isOwner ? memberships[0] : expiredMembership);
  if (!selected && !isOwner) return res.status(403).json({ message: 'This user has no active store subscription.' });
  return res.json(await sessionPayload(user, selected?.id ?? null, isOwner));
});

router.post('/switch-store', authenticate, async (req, res) => {
  const storeId = Number(req.body?.storeId);
  if (!Number.isSafeInteger(storeId) || storeId <= 0) return res.status(400).json({ message: 'Select a valid store.' });
  const { rows: storeRows } = await controlDb.execute({
    sql: `SELECT s.id, s.subscription_status AS subscriptionStatus, s.trial_ends_at AS trialEndsAt,
      s.subscription_expires_at AS subscriptionExpiresAt, s.is_active AS isActive
      FROM stores s LEFT JOIN user_stores us ON us.store_id = s.id AND us.user_id = ?
      WHERE s.id = ? AND (us.user_id IS NOT NULL OR ?)`,
    args: [req.auth.userId, storeId, req.auth.isOwner ? 1 : 0],
  });
  const store = storeRows[0];
  if (!store || !store.isActive) return res.status(403).json({ message: 'This store is not available to your account.' });
  const expiry = store.subscriptionStatus === 'Trial' ? store.trialEndsAt : store.subscriptionExpiresAt;
  const usable = ['Active', 'Trial'].includes(store.subscriptionStatus) && (!expiry || Date.parse(expiry) > Date.now());
  const expired = expiry && Date.parse(expiry) <= Date.now();
  if (!usable && !(req.auth.isOwner || expired)) return res.status(403).json({ message: 'This store subscription is inactive or expired.' });
  const tx = await controlDb.transaction('write');
  try {
    await tx.execute({ sql: 'UPDATE user_stores SET is_default = 0 WHERE user_id = ?', args: [req.auth.userId] });
    await tx.execute({
      sql: `INSERT INTO user_stores(user_id, store_id, is_default) VALUES(?, ?, 1)
        ON CONFLICT(user_id, store_id) DO UPDATE SET is_default = 1`, args: [req.auth.userId, storeId],
    });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  const { rows } = await controlDb.execute({
    sql: `SELECT id, email, security_version AS securityVersion FROM users WHERE id = ?`,
    args: [req.auth.userId],
  });
  return res.json(await sessionPayload(rows[0], storeId, req.auth.isOwner));
});

router.get('/users', ...ownerOnly, async (_req, res) => {
  const { rows } = await controlDb.execute(`SELECT id, email, is_active AS isActive FROM users ORDER BY email`);
  const result = [];
  for (const user of rows) {
    const stores = await controlDb.execute({ sql: 'SELECT store_id FROM user_stores WHERE user_id = ? ORDER BY is_default DESC', args: [user.id] });
    const roles = await controlDb.execute({
      sql: `SELECT DISTINCT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.name`,
      args: [user.id],
    });
    result.push({ ...user, roles: roles.rows.map((row) => row.name), storeIds: stores.rows.map((row) => Number(row.store_id)) });
  }
  res.json(result);
});

router.post('/users', ...ownerOnly, async (req, res) => {
  const email = String(req.body?.email ?? '').trim();
  const password = String(req.body?.password ?? '');
  const roleNames = [...new Set((Array.isArray(req.body?.roles) ? req.body.roles : []).map((role) => String(role).trim()).filter(Boolean))];
  const storeIds = [...new Set((Array.isArray(req.body?.storeIds) ? req.body.storeIds : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!email.includes('@') || !validatePassword(password) || !roleNames.length || !storeIds.length) {
    return res.status(400).json({ message: 'Enter a valid email, a password (12+ characters including a symbol), at least one role and one store.' });
  }
  const storeMarks = storeIds.map(() => '?').join(',');
  const activeStores = await controlDb.execute({ sql: `SELECT id FROM stores WHERE is_active = 1 AND id IN (${storeMarks})`, args: storeIds });
  if (activeStores.rows.length !== storeIds.length) return res.status(400).json({ message: 'One or more selected stores are inactive or missing.' });
  for (const storeId of storeIds) {
    for (const roleName of roleNames) {
      const result = await controlDb.execute({ sql: 'SELECT id FROM roles WHERE store_id = ? AND name = ? COLLATE NOCASE', args: [storeId, roleName] });
      if (!result.rows.length) return res.status(400).json({ message: `Role ${roleName} is not configured for every selected store.` });
    }
  }
  const userId = randomUUID();
  const tx = await controlDb.transaction('write');
  try {
    await tx.execute({ sql: 'INSERT INTO users(id, email, password_hash) VALUES(?, ?, ?)', args: [userId, email, await hashPassword(password)] });
    for (const [index, storeId] of storeIds.entries()) {
      await tx.execute({ sql: 'INSERT INTO user_stores(user_id, store_id, is_default) VALUES(?, ?, ?)', args: [userId, storeId, index === 0 ? 1 : 0] });
      for (const roleName of roleNames) await tx.execute({
        sql: 'INSERT INTO user_roles(user_id, store_id, role_id) SELECT ?, ?, id FROM roles WHERE store_id = ? AND name = ? COLLATE NOCASE',
        args: [userId, storeId, storeId, roleName],
      });
    }
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  res.status(201).location(`/api/auth/users/${userId}`).json({ id: userId, email, roles: roleNames, isActive: true, storeIds });
});

router.put('/users/:id/roles', ...ownerOnly, async (req, res) => {
  const names = [...new Set((Array.isArray(req.body?.roles) ? req.body.roles : []).map((name) => String(name).trim()).filter(Boolean))];
  if (!names.length) return res.status(400).json({ message: 'A user must keep at least one role.' });
  const memberships = await controlDb.execute({ sql: 'SELECT store_id FROM user_stores WHERE user_id = ?', args: [req.params.id] });
  if (!memberships.rows.length) return res.status(404).json({ message: 'User not found.' });
  const tx = await controlDb.transaction('write');
  try {
    for (const { store_id: storeId } of memberships.rows) {
      const roleRows = await tx.execute({
        sql: `SELECT id, name FROM roles WHERE store_id = ? AND name IN (${names.map(() => '?').join(',')})`,
        args: [storeId, ...names],
      });
      if (roleRows.rows.length !== names.length) throw Object.assign(new Error('One or more roles do not exist for a store assigned to this user.'), { status: 400 });
      await tx.execute({ sql: 'DELETE FROM user_roles WHERE user_id = ? AND store_id = ?', args: [req.params.id, storeId] });
      for (const role of roleRows.rows) await tx.execute({ sql: 'INSERT INTO user_roles(user_id, store_id, role_id) VALUES(?, ?, ?)', args: [req.params.id, storeId, role.id] });
    }
    await tx.execute({ sql: 'UPDATE users SET security_version = security_version + 1 WHERE id = ?', args: [req.params.id] });
    await tx.commit();
  } catch (error) { await tx.rollback(); if (error.status) return res.status(error.status).json({ message: error.message }); throw error; }
  clearPermissionCache(req.params.id);
  res.json({ userId: req.params.id, roles: names });
});

router.put('/users/:id/status', ...ownerOnly, async (req, res) => {
  const isActive = req.body?.isActive;
  if (typeof isActive !== 'boolean') return res.status(400).json({ message: 'Set account status.' });
  if (req.params.id === req.auth.userId && !isActive) return res.status(400).json({ message: 'You cannot deactivate your own account.' });
  const updated = await controlDb.execute({
    sql: 'UPDATE users SET is_active = ?, security_version = security_version + 1 WHERE id = ? RETURNING id, email',
    args: [isActive ? 1 : 0, req.params.id],
  });
  if (!updated.rows.length) return res.sendStatus(404);
  clearPermissionCache(req.params.id);
  const [roles, stores] = await Promise.all([
    controlDb.execute({ sql: 'SELECT DISTINCT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?', args: [req.params.id] }),
    controlDb.execute({ sql: 'SELECT store_id FROM user_stores WHERE user_id = ?', args: [req.params.id] }),
  ]);
  res.json({ id: req.params.id, email: updated.rows[0].email, roles: roles.rows.map((row) => row.name), isActive, storeIds: stores.rows.map((row) => Number(row.store_id)) });
});

router.put('/users/:id/password', ...ownerOnly, async (req, res) => {
  if (req.params.id === req.auth.userId) return res.status(400).json({ message: 'Use account recovery to change your own password.' });
  const password = String(req.body?.newPassword ?? '');
  if (!validatePassword(password)) return res.status(400).json({ message: 'Password must be at least 12 characters and include a symbol.' });
  const result = await controlDb.execute({
    sql: 'UPDATE users SET password_hash = ?, security_version = security_version + 1, failed_login_count = 0, locked_until = NULL WHERE id = ? RETURNING id',
    args: [await hashPassword(password), req.params.id],
  });
  if (!result.rows.length) return res.sendStatus(404);
  res.json({ userId: req.params.id, message: 'Password reset. Previous sessions have been revoked.' });
});

router.put('/users/:id/stores', ...ownerOnly, async (req, res) => {
  if (req.params.id === req.auth.userId) return res.status(400).json({ message: 'Use another owner account to change your own store access.' });
  const storeIds = [...new Set((Array.isArray(req.body?.storeIds) ? req.body.storeIds : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!storeIds.length) return res.status(400).json({ message: 'Assign the user to at least one store.' });
  const defaultStoreId = Number(req.body?.defaultStoreId ?? storeIds[0]);
  if (!storeIds.includes(defaultStoreId)) return res.status(400).json({ message: 'Default store must be assigned to the user.' });
  const placeholders = storeIds.map(() => '?').join(',');
  const active = await controlDb.execute({ sql: `SELECT id FROM stores WHERE is_active = 1 AND id IN (${placeholders})`, args: storeIds });
  if (active.rows.length !== storeIds.length) return res.status(400).json({ message: 'One or more selected stores are inactive or missing.' });
  const tx = await controlDb.transaction('write');
  try {
    await tx.execute({ sql: 'DELETE FROM user_stores WHERE user_id = ?', args: [req.params.id] });
    for (const storeId of storeIds) await tx.execute({
      sql: 'INSERT INTO user_stores(user_id, store_id, is_default) VALUES(?, ?, ?)', args: [req.params.id, storeId, storeId === defaultStoreId ? 1 : 0],
    });
    await tx.execute({ sql: 'UPDATE users SET security_version = security_version + 1 WHERE id = ?', args: [req.params.id] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  res.json({ userId: req.params.id, storeIds, defaultStoreId });
});

router.get('/roles', authenticate, async (req, res) => {
  if (!req.auth.isOwner && !req.auth.storeId) return res.status(400).json({ message: 'Select a store.' });
  const storeId = Number(req.query.storeId ?? req.auth.storeId);
  if (!req.auth.isOwner && storeId !== req.auth.storeId) return res.sendStatus(403);
  const { rows } = await controlDb.execute({
    sql: `SELECT r.id, r.name, r.is_system AS isSystem, rp.permission_key AS permission
      FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id WHERE r.store_id = ? ORDER BY r.name, rp.permission_key`,
    args: [storeId],
  });
  const grouped = new Map();
  for (const row of rows) {
    const item = grouped.get(Number(row.id)) ?? { id: String(row.id), name: row.name, permissions: [], canAssign: true };
    if (row.permission) item.permissions.push(row.permission);
    grouped.set(Number(row.id), item);
  }
  res.json([...grouped.values()].map((role) => ({
    ...role,
    availablePermissions: Object.entries(permissions).map(([key, label]) => ({ key, label })),
  })));
});

router.post('/roles', ...ownerOnly, async (req, res) => {
  const storeId = Number(req.body?.storeId ?? req.auth.storeId);
  const name = String(req.body?.name ?? '').trim();
  if (!roleNamePattern.test(name)) return res.status(400).json({ message: 'Role name must be 3–40 characters and use letters, numbers, spaces, _ or -.' });
  if (name.toLowerCase() === 'administrator') return res.status(409).json({ message: 'The Administrator role is reserved.' });
  try {
    const result = await controlDb.execute({ sql: 'INSERT INTO roles(store_id, name, is_system) VALUES(?, ?, 0) RETURNING id, name', args: [storeId, name] });
    res.status(201).location(`/api/auth/roles/${result.rows[0].id}`).json({ id: String(result.rows[0].id), name: result.rows[0].name, permissions: [] });
  } catch (error) { if (String(error.message).includes('UNIQUE')) return res.status(409).json({ message: 'Role name already exists.' }); throw error; }
});

router.put('/roles/:id/permissions', ...ownerOnly, async (req, res) => {
  const roleId = Number(req.params.id);
  const storeId = Number(req.body?.storeId ?? req.auth.storeId);
  const { rows } = await controlDb.execute({ sql: 'SELECT id, name FROM roles WHERE id = ? AND store_id = ?', args: [roleId, storeId] });
  const role = rows[0];
  if (!role) return res.sendStatus(404);
  if (role.name === 'Administrator') return res.status(400).json({ message: 'Administrator permissions are fixed.' });
  const values = [...new Set((Array.isArray(req.body?.permissions) ? req.body.permissions : []).map(String))];
  const invalid = values.filter((key) => !permissions[key]);
  if (invalid.length) return res.status(400).json({ message: 'Unknown permission key.', permissions: invalid });
  const tx = await controlDb.transaction('write');
  try {
    await tx.execute({ sql: 'DELETE FROM role_permissions WHERE role_id = ?', args: [roleId] });
    for (const permission of values) await tx.execute({ sql: 'INSERT INTO role_permissions(role_id, permission_key) VALUES(?, ?)', args: [roleId, permission] });
    const { rows: users } = await tx.execute({ sql: 'SELECT user_id FROM user_roles WHERE role_id = ?', args: [roleId] });
    for (const user of users) await tx.execute({ sql: 'UPDATE users SET security_version = security_version + 1 WHERE id = ?', args: [user.user_id] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  res.json({ id: String(roleId), name: role.name, permissions: values });
});

export default router;
