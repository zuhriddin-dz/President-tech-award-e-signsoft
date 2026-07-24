import { z } from 'zod';

// Fail-fast env contract: the process refuses to boot on a bad environment.
// Phases add variables HERE and nowhere else — no stray process.env reads.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
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
