import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

function key() {
  const value = Buffer.from(env.DATABASE_TOKEN_ENCRYPTION_KEY, 'base64');
  if (value.length !== 32) throw new Error('DATABASE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
  return value;
}

export function encryptSecret(plainText) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptSecret(encoded) {
  const data = Buffer.from(encoded, 'base64');
  if (data.length < 29) throw new Error('Stored database credential is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
