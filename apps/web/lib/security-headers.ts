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
 * What this app actually loads, and nothing else:
 *
 *   Clerk  — clerk-js plus its UI. On a production instance it is served
 *            FIRST-PARTY from /__clerk/* (see middleware.ts), so 'self' covers
 *            it; the accounts.dev hosts are what a pk_test_ instance uses, and
 *            img.clerk.com serves member avatars. Clerk's bot protection is
 *            Cloudflare Turnstile, which needs a script and a frame.
 *   Vercel — @vercel/analytics loads /_vercel/insights/script.js, same-origin.
 *   pdf.js — renders in a Web Worker from a blob URL, and draws to canvas.
 *
 * `strict-dynamic` means the host allowlist in script-src is ignored by
 * browsers that understand it: only the nonce (and whatever a nonced script
 * loads) executes. The hosts stay for older browsers, which fall back to the
 * allowlist.
 */
export function buildCsp(nonce: string, isProduction: boolean): string {
  const devEval = isProduction ? '' : " 'unsafe-eval'";
  const clerk = 'https://*.clerk.accounts.dev https://*.clerk.com';
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
