import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const REQUIRED = {
  CLERK_SECRET_KEY: 'sk_test_xxxxxxxxxxxxxxxxxxxxx',
  APP_DATABASE_URL: 'postgresql://docflow_app:pw@host/db',
  S3_ENDPOINT: 'https://acc.r2.example',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  ESIGN_SEAL_KEYS: '[{"kid":"t","privateKeyPkcs8Pem":"x","state":"active"}]',
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'DocFlow <onboarding@resend.dev>',
  SIGN_APP_URL: 'http://localhost:3300',
};

describe('env contract', () => {
  it('applies defaults (DocFlow port convention: 5100)', () => {
    const env = parseEnv({ ...REQUIRED });
    expect(env.PORT).toBe(5100);
    expect(env.NODE_ENV).toBe('development');
  });

  it('refuses to boot when a required secret is missing', () => {
    expect(() => parseEnv({})).toThrow(/CLERK_SECRET_KEY/);
  });

  it('refuses a non-postgres database url', () => {
    expect(() => parseEnv({ ...REQUIRED, APP_DATABASE_URL: 'mysql://nope' })).toThrow(
      /APP_DATABASE_URL/,
    );
  });

  it('names the bad key but never echoes the value', () => {
    expect(() => parseEnv({ ...REQUIRED, PORT: 'not-a-port' })).toThrow(/PORT/);
    expect(() => parseEnv({ ...REQUIRED, PORT: 'not-a-port' })).not.toThrow(/not-a-port/);
  });
});
