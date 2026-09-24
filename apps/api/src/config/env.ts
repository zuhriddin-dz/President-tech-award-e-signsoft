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
  // 5100 — E-SIGNSOFT's port convention; 5000 belongs to the tms API on this machine.
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
  // Ed25519 seal ring JSON [{kid, privateKeyPkcs8Pem, state}] — long-lived,
  // separate from auth keys, exactly one active. Validated deeply by
  // parseSealRing() where SealService is constructed.
  ESIGN_SEAL_KEYS: z.string().min(1),
  // Transactional email (Resend now; SES later behind the same interface).
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  // Where operational alerts go — a stuck completion, a sweep that keeps
  // failing. OPTIONAL on purpose: monitoring must not become the reason a
  // deploy will not boot. Unset means alerts are logged and not sent.
  ALERT_EMAIL: z.email().optional(),
  // Public signing app origin — the base of every invite link.
  SIGN_APP_URL: z.url(),
  // Signing-link lifetime in days.
  ESIGN_LINK_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  // Nudge a signer who has been sitting on a live link this long, at most
  // REMINDER_MAX times — polite, capped, never spam.
  REMINDER_AFTER_DAYS: z.coerce.number().int().min(1).max(90).default(3),
  REMINDER_MAX: z.coerce.number().int().min(0).max(10).default(3),
  // The narrow credential the public signing app relays with — accepted ONLY
  // on /sign/* routes, so a compromise of that box reaches the signing surface
  // and nothing else. >= 32 bytes.
  SIGN_RELAY_SECRET: z.string().min(32),
  // The equivalent narrow credential for the PUBLIC VERIFY hop in apps/web.
  //
  // /verify is the one route with no credential of any kind, so its per-IP
  // budget can only be keyed on an address somebody vouches for — and on a
  // public origin, an unauthenticated `x-client-ip` header is a value the
  // attacker picks. With this set, apps/web's /api/verify route presents it and
  // its forwarded client address is believed; without it the header is ignored
  // and the budget falls back to the caller's real socket address.
  //
  // OPTIONAL on purpose: unset is safe (coarser, never weaker), so an existing
  // deploy keeps booting and can adopt it whenever apps/web is updated too.
  VERIFY_RELAY_SECRET: z.string().min(32).optional(),

  // ── Billing ───────────────────────────────────────────────────────────────
  //
  // The dashboard origin, used to send a customer back from a provider's
  // checkout page. Optional: without it the provider shows its own "done"
  // screen and the customer finds their way back themselves, which is worse
  // but is not a reason to refuse to boot.
  WEB_APP_URL: z.url().optional(),
  //
  // Payme (Paycom). MERCHANT_ID identifies the cashbox; KEY is the merchant
  // key that Payme presents back to us as HTTP Basic credentials on every
  // callback — it is the ONLY thing separating a real callback from anyone on
  // the internet posting JSON at us, so treat it like a signing key.
  //
  // ACCOUNT_FIELD must equal the field name configured in the Payme cabinet:
  // Payme sends `account: { <that name>: <our payment id> }`, and a mismatch
  // means every payment looks like an unknown order.
  PAYME_MERCHANT_ID: z.string().min(1).optional(),
  PAYME_KEY: z.string().min(1).optional(),
  PAYME_ACCOUNT_FIELD: z.string().min(1).default('order_id'),
  PAYME_CHECKOUT_URL: z.url().default('https://checkout.paycom.uz'),
  //
  // Click. SECRET_KEY is not sent to us — both sides hash it into the
  // signature over the other fields, which is what proves the callback came
  // from Click.
  CLICK_MERCHANT_ID: z.string().min(1).optional(),
  CLICK_SERVICE_ID: z.string().min(1).optional(),
  CLICK_SECRET_KEY: z.string().min(1).optional(),
  CLICK_CHECKOUT_URL: z.url().default('https://my.click.uz/services/pay'),
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
