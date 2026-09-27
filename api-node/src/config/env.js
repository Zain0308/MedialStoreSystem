import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5080),
  WEB_ORIGIN: z.string().url().default('http://localhost:4200'),
  JWT_SECRET: z.string().min(32),
  OWNER_EMAIL: z.string().email(),
  TURSO_CONTROL_DATABASE_URL: z.string().startsWith('libsql://'),
  TURSO_CONTROL_AUTH_TOKEN: z.string().min(20),
  TURSO_PLATFORM_TOKEN: z.string().min(20),
  TURSO_ORGANIZATION: z.string().min(1),
  TURSO_GROUP: z.string().default('default'),
  TURSO_LOCATION: z.string().default('aws-ap-south-1'),
  DATABASE_TOKEN_ENCRYPTION_KEY: z.string().min(40),
  BOOTSTRAP_STORE_CODE: z.string().default('MAIN'),
  BOOTSTRAP_STORE_NAME: z.string().default('Main Store'),
  BOOTSTRAP_STORE_DATABASE_URL: z.string().optional().default(''),
  BOOTSTRAP_STORE_AUTH_TOKEN: z.string().optional().default(''),
  BOOTSTRAP_OWNER_PASSWORD: z.string().optional().default(''),
});

export const env = schema.parse(process.env);
export const isProduction = env.NODE_ENV === 'production';
export const allowedWebOrigins = env.WEB_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean);
