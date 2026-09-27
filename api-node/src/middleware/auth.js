import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';
import { controlDb } from '../db/control.js';
import { getStoreRecord, getTenantDb } from '../db/tenant.js';
import { userHasPermission } from '../security/permissions.js';

const jwtKey = new TextEncoder().encode(env.JWT_SECRET);
const permissionMemo = new Map();

export async function createSession(user, storeId = null, isOwner = false) {
  return new SignJWT({
    email: user.email,
    store_id: storeId,
    app_owner: isOwner,
    security_version: Number(user.securityVersion),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer('MedicalStore')
    .setAudience('MedicalStore.Web')
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(jwtKey);
}

export async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ message: 'Sign in to continue.' });
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwtKey, {
      issuer: 'MedicalStore', audience: 'MedicalStore.Web', clockTolerance: 30,
    }));
  } catch {
    return res.status(401).json({ message: 'The session is invalid or has expired.' });
  }
  try {
    const { rows } = await controlDb.execute({
      sql: `SELECT id, email, is_active AS isActive, security_version AS securityVersion
        FROM users WHERE id = ?`,
      args: [payload.sub],
    });
    const user = rows[0];
    if (!user || !user.isActive || Number(user.securityVersion) !== Number(payload.security_version)) {
      return res.status(401).json({ message: 'Account access changed. Sign in again.' });
    }
    const owner = String(user.email).toLowerCase() === env.OWNER_EMAIL.toLowerCase();
    if (Boolean(payload.app_owner) !== owner) return res.status(401).json({ message: 'Application Owner access changed.' });

    req.auth = { userId: user.id, email: user.email, storeId: payload.store_id ? Number(payload.store_id) : null, isOwner: owner };
    if (req.auth.storeId) {
      const membership = owner ? { is_default: 1 } : (await controlDb.execute({
        sql: `SELECT is_default FROM user_stores WHERE user_id = ? AND store_id = ?`,
        args: [user.id, req.auth.storeId],
      })).rows[0];
      if (!membership) return res.status(403).json({ message: 'This store is not assigned to your account.' });
      const store = await getStoreRecord(req.auth.storeId);
      if (!store || !store.isActive) return res.status(403).json({ message: 'This store is inactive.' });
      const now = Date.now();
      const expiry = store.subscriptionStatus === 'Trial' ? store.trialEndsAt : store.subscriptionExpiresAt;
      req.auth.subscriptionExpired = Boolean(expiry && Date.parse(expiry) <= now);
      const active = store.subscriptionStatus === 'Active' && (!expiry || Date.parse(expiry) > now);
      const trial = store.subscriptionStatus === 'Trial' && expiry && Date.parse(expiry) > now;
      if (!owner && !active && !trial && !req.auth.subscriptionExpired) {
        return res.status(403).json({ message: 'This store subscription is inactive.' });
      }
      req.store = store;
    }
    return next();
  } catch (error) { return next(error); }
}

export function requireOwner(req, res, next) {
  if (!req.auth?.isOwner) return res.status(403).json({ message: 'Application Owner access is required.' });
  next();
}

export async function requireStore(req, res, next) {
  if (!req.auth?.storeId) return res.status(400).json({ message: 'Select a store before using this feature.' });
  if (req.auth.subscriptionExpired && req.path !== '/dashboard') {
    return res.status(403).json({ message: "This store's subscription has expired. Only the dashboard is available." });
  }
  try { req.db = await getTenantDb(req.store); next(); }
  catch (error) { next(error); }
}

export function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.auth?.storeId || !req.db) return res.status(400).json({ message: 'Select a store before using this feature.' });
    if (req.auth.isOwner) return next();
    try {
      const cacheKey = `${req.auth.userId}:${req.auth.storeId}:${permission}`;
      const cached = permissionMemo.get(cacheKey);
      const allowed = cached && cached.until > Date.now()
        ? cached.allowed
        : await userHasPermission(controlDb, req.auth.userId, req.auth.storeId, permission);
      permissionMemo.set(cacheKey, { allowed, until: Date.now() + 10_000 });
      if (!allowed) return res.status(403).json({ message: 'You do not have permission to perform this action.' });
      next();
    } catch (error) { next(error); }
  };
}

export function clearPermissionCache(userId) {
  for (const key of permissionMemo.keys()) if (key.startsWith(`${userId}:`)) permissionMemo.delete(key);
}
