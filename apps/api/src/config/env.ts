import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Local dev loads apps/api/.env; deploy platforms inject real env vars and
// the file simply doesn't exist there.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  /* no .env file — fine */
}

// Fail-fast env contract: the process refuses to boot on a bad environment.
// Phases add variables HERE and nowhere else — no stray process.env reads.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // 5100 — DocFlow's port convention; 5000 belongs to the tms API on this machine.
  PORT: z.coerce.number().int().min(1).max(65535).default(5100),
  CLERK_SECRET_KEY: z.string().min(20),
  // Runtime role over the pooled host — never neondb_owner (BYPASSRLS).
  APP_DATABASE_URL: z.string().startsWith('postgresql://'),
  // R2 (S3 API) — private bucket, token scoped to it alone.
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  // BullMQ backend (redis:// locally, rediss:// on Upstash).
  REDIS_URL: z.string().startsWith('redis'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Names of the bad keys only — never echo values into logs.
    const bad = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment: ${bad}`);
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);
