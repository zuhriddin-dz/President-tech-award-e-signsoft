import { describe, expect, it } from 'vitest';
import { buildCsp, clerkFrontendApiOrigin } from './security-headers';

/**
 * The policy that first ran enforced in production blocked every call clerk-js
 * made to its own Frontend API. clerk-js loads from, and then talks to,
 * clerk.esignsoft.uz — a host none of the wildcard entries match — and
 * connect-src has no nonce escape hatch. The sign-in form still drew, so the
 * page looked fine while sign-in could not work.
 *
 * These pin both halves of the fix: the host is read correctly out of the
 * publishable key, and it lands in the directives the browser actually checks.
 */

/** One directive's source list, e.g. directive(csp, 'connect-src'). */
function directive(csp: string, name: string): string[] {
  const found = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
  return found ? found.split(/\s+/).slice(1) : [];
}

/** A publishable key for `host`: base64 of `host$`, unpadded as Clerk issues it. */
function keyFor(prefix: 'pk_live_' | 'pk_test_', host: string): string {
  return prefix + btoa(`${host}$`).replace(/=+$/, '');
}

describe('clerkFrontendApiOrigin', () => {
  it('reads the production Frontend API out of the real publishable key', () => {
    // A publishable key is public by design — it is printed into every page.
    expect(clerkFrontendApiOrigin('pk_live_Y2xlcmsuZXNpZ25zb2Z0LnV6JA')).toBe(
      'https://clerk.esignsoft.uz',
    );
  });

  it('reads a development instance host', () => {
    expect(clerkFrontendApiOrigin(keyFor('pk_test_', 'fine-lamb-42.clerk.accounts.dev'))).toBe(
      'https://fine-lamb-42.clerk.accounts.dev',
    );
  });

  it('accepts padded and unpadded keys, and ignores surrounding whitespace', () => {
    const padded = `pk_live_${btoa('clerk.example.com$')}`;
    expect(clerkFrontendApiOrigin(`  ${padded}\n`)).toBe('https://clerk.example.com');
    expect(clerkFrontendApiOrigin(keyFor('pk_live_', 'clerk.example.com'))).toBe(
      'https://clerk.example.com',
    );
  });

  // Every one of these must stay OUT of the policy. A value that is not a plain
  // hostname would widen connect-src to whatever the string happened to hold.
  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['a secret key', `sk_live_${btoa('clerk.esignsoft.uz$')}`],
    ['a key with no payload', 'pk_live_'],
    ['a payload that is not base64', 'pk_live_!!!not-base64'],
    ['a host with a path', keyFor('pk_live_', 'clerk.example.com/evil')],
    ['a wildcard', keyFor('pk_live_', '*.example.com')],
    ['an extra CSP source smuggled in', keyFor('pk_live_', "clerk.example.com 'unsafe-inline'")],
    ['a bare single label', keyFor('pk_live_', 'localhost')],
  ])('returns null for %s', (_label, key) => {
    expect(clerkFrontendApiOrigin(key)).toBeNull();
  });
});

describe('buildCsp', () => {
  const FAPI = 'https://clerk.esignsoft.uz';

  it('lets clerk-js reach its Frontend API: the origin is in connect-src', () => {
    expect(directive(buildCsp('n0nce', true, FAPI), 'connect-src')).toContain(FAPI);
  });

  it('names it in script-src too, for browsers that ignore strict-dynamic', () => {
    const script = directive(buildCsp('n0nce', true, FAPI), 'script-src');
    expect(script).toContain(FAPI);
    expect(script).toContain("'strict-dynamic'");
    expect(script).toContain("'nonce-n0nce'");
  });

  it('keeps the wildcard Clerk hosts and adds nothing when no origin is known', () => {
    const csp = buildCsp('n0nce', true, null);
    expect(directive(csp, 'connect-src')).toEqual([
      "'self'",
      'https://*.clerk.accounts.dev',
      'https://*.clerk.com',
      'https://clerk-telemetry.com',
    ]);
    // A missing origin must disappear, not be stringified into the header.
    expect(csp).not.toMatch(/\bnull\b|\bundefined\b/);
  });

  it('only allows unsafe-eval outside production', () => {
    expect(directive(buildCsp('n', true, FAPI), 'script-src')).not.toContain("'unsafe-eval'");
    expect(directive(buildCsp('n', false, FAPI), 'script-src')).toContain("'unsafe-eval'");
  });
});
