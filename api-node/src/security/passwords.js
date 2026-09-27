import bcrypt from 'bcryptjs';

export const hashPassword = (password) => bcrypt.hash(password, 12);
export const verifyPassword = (password, passwordHash) => bcrypt.compare(password, passwordHash);

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 12 && /[^A-Za-z0-9]/.test(password);
}
