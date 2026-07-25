import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashSigningToken, mintSigningToken, sha256Hex } from './tokens.js';

describe('signing tokens', () => {
  it('mints a 256-bit base64url token and stores only its sha256', () => {
    const { token, sha256 } = mintSigningToken();
    // 32 random bytes -> 43 base64url chars, no padding.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256).toBe(createHash('sha256').update(token).digest('hex'));
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never repeats a token across mints', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(mintSigningToken().token);
    expect(seen.size).toBe(1000);
  });

  it('hashSigningToken reproduces the stored hash for the presented raw token', () => {
    const { token, sha256 } = mintSigningToken();
    expect(hashSigningToken(token)).toBe(sha256);
    expect(hashSigningToken(token + 'x')).not.toBe(sha256);
  });

  it('sha256Hex fingerprints bytes deterministically', () => {
    const bytes = Buffer.from('%PDF-1.7 signed');
    expect(sha256Hex(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});
