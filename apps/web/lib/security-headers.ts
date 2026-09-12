/**
 * Response security headers for the product app.
 *
 * apps/sign has carried a full set since it was written; this app — the one
 * holding the Clerk session and every workspace's document list — carried
 * none. That asymmetry was backwards: the credential-poor box was hardened and
 * the credential-rich one was not.
 *
 * THE CSP IS STAGED, DELIBERATELY. Everything except the policy itself is
 * unconditional, because none of it can break a working page. The policy is
 * Report-Only by default, because this app loads Clerk (which injects its own
 * script), Vercel Analytics and pdf.js, and a policy that is wrong about any of
 * them turns the whole dashboard into a blank page. Report-Only publishes the
 * exact same rules and reports violations to the browser console without
 * enforcing them, so the policy can be confirmed against a real session and
 * then switched on by setting one variable — rather than being guessed at in
 * production. See WEB_CSP_MODE in DEPLOY.md.
 */
export type CspMode = 'enforce' | 'report-only' | 'off';

export function cspMode(raw: string | undefined): CspMode {
  const value = raw?.trim().toLowerCase();
  if (value === 'enforce') return 'enforce';
  if (value === 'off') return 'off';
  return 'report-only';
}

/**
 * The origin of this instance's Clerk Frontend API, read out of the
 * publishable key — or null when the key is not one we can read.
 *
 * A publishable key is `pk_live_` / `pk_test_` followed by the base64 of the
 * Frontend API host and a trailing `$`: pk_live_Y2xlcmsuZXNpZ25zb2Z0LnV6JA
 * decodes to `clerk.esignsoft.uz$`. Deriving it rather than hardcoding it keeps
 * one policy correct for every key — a pk_test_ instance on *.clerk.accounts.dev
 * and a production instance on its own custom domain alike.
 *
 * Returns null rather than guessing. A decoded value that is not a plain
 * hostname is never added to the policy, so a malformed key degrades to the
 * wildcard hosts in buildCsp instead of widening connect-src to whatever the
 * string happened to contain.
 */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const match = /^pk_(?:live|test)_([A-Za-z0-9+/=]+)$/.exec(publishableKey?.trim() ?? '');
  if (!match) return null;
  let decoded: string;
  try {
    decoded = atob(match[1]!);
  } catch {
    return null;
  }
  const host = decoded.endsWith('$') ? decoded.slice(0, -1) : decoded;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host)) {
    return null;
  }
  return `https://${host.toLowerCase()}`;
}

/**
 * What this app actually loads, and nothing else:
 *
 *   Clerk  — clerk-js and its UI load from the instance's Frontend API host,
 *            and clerk-js then calls /v1/* on that same host. For a production
 *            instance that host is the custom domain (clerk.esignsoft.uz),
 *            which none of the wildcard hosts cover. With the policy enforced,
 *            the browser refused every one of those calls — /v1/environment and
 *            /v1/client, retries included — and sign-in could not work, while
 *            the form still drew. So the Frontend API origin is passed in,
 *            derived from the publishable key. The accounts.dev hosts cover a
 *            pk_test_ instance; img.clerk.com serves member avatars. Clerk's
 *            bot protection is Cloudflare Turnstile, which needs a script and a
 *            frame.
 *   Vercel — @vercel/analytics loads /_vercel/insights/script.js, same-origin.
 *   pdf.js — renders in a Web Worker from a blob URL, and draws to canvas.
 *
 * `strict-dynamic` means the host allowlist in script-src is ignored by
 * browsers that understand it: only the nonce (and whatever a nonced script
 * loads) executes. The hosts stay for older browsers, which fall back to the
 * allowlist. connect-src has no such escape hatch — it is always host-based —
 * which is why the Frontend API origin must be named there explicitly, and why
 * a nonce alone was never enough.
 */
export function buildCsp(
  nonce: string,
  isProduction: boolean,
  clerkFrontendApi: string | null = null,
): string {
  const devEval = isProduction ? '' : " 'unsafe-eval'";
  const clerk = ['https://*.clerk.accounts.dev', 'https://*.clerk.com', clerkFrontendApi]
    .filter(Boolean)
    .join(' ');
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${clerk} https://challenges.cloudflare.com${devEval}`,
    // Tailwind's runtime-injected styles and React's inline style attributes.
    // A nonce cannot cover style attributes, so this is honest rather than lax.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://img.clerk.com`,
    `font-src 'self' data:`,
    `connect-src 'self' ${clerk} https://clerk-telemetry.com`,
    // pdf.js worker, served from our own origin as a blob.
    `worker-src 'self' blob:`,
    `frame-src 'self' https://challenges.cloudflare.com`,
    `frame-ancestors 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

/**
 * The headers that are always safe to send. Nothing here can change what a
 * page is allowed to load, so none of it can break a working screen.
 *
 * Referrer-Policy is `strict-origin-when-cross-origin` rather than apps/sign's
 * `no-referrer`: this app has no secret in its URLs, and same-origin navigation
 * inside the dashboard legitimately wants the path.
 */
export function applyBaseSecurityHeaders(headers: Headers): void {
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
}
