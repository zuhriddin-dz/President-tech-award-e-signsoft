import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { applyBaseSecurityHeaders, buildCsp, cspMode } from '@/lib/security-headers';

// The landing page ('/') and the auth pages are public; everything else
// (dashboard, templates, /api/*) requires a session.
// Legal pages are public on purpose: a person deciding whether to sign must be
// able to read the terms and the privacy policy without an account.
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/terms',
  '/privacy',
  // Verification is public on purpose. Evidence that can only be checked by
  // someone with an account here is not evidence — the person who most needs
  // to check a signed document is the counterparty who received it, and they
  // have no reason to hold an account with us.
  '/verify',
  '/api/verify',
]);

const MODE = cspMode(process.env.WEB_CSP_MODE);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Everything except the auth pages requires a session. The BFF /api routes
// are protected too — they forward the caller's own token, never a shared one.
//
// The same pass also attaches this app's security headers. They were missing
// entirely: apps/sign shipped a CSP, HSTS and frame-deny from the start while
// the app holding the session cookie shipped none of them.
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();

  const requestHeaders = new Headers(req.headers);
  let csp: string | null = null;

  if (MODE !== 'off') {
    // btoa, not Buffer: middleware runs on the EDGE runtime by default, where
    // Buffer is not guaranteed to exist. apps/sign gets away with it only
    // because it declares `runtime = 'nodejs'`.
    const nonce = btoa(crypto.randomUUID());
    csp = buildCsp(nonce, IS_PRODUCTION);
    requestHeaders.set('x-nonce', nonce);
    // Next reads the nonce out of the CSP on the REQUEST headers to stamp its
    // own injected bootstrap scripts. Set even in report-only mode, so the
    // nonces are already correct when the policy is switched to enforcing and
    // the switch is not itself the change that breaks hydration.
    requestHeaders.set('Content-Security-Policy', csp);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  applyBaseSecurityHeaders(res.headers);
  if (csp) {
    res.headers.set(
      MODE === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
      csp,
    );
  }
  return res;
});

export const config = {
  matcher: [
    // Clerk serves clerk-js and its UI bundle FIRST-PARTY from /__clerk/* once
    // the instance is on a production custom domain — clerkMiddleware is what
    // answers those requests. They end in .js, so the static-asset exclusion
    // below skips them and Next returns 404: clerk-js never loads and every
    // <SignIn/> renders as an empty page. Listed first, and deliberately not
    // subject to that exclusion.
    //
    // Only reproducible in production: a pk_test_ instance loads clerk-js from
    // Clerk's own domain and never touches this path.
    '/__clerk/(.*)',
    '/((?!_next|.*\\.(?:ico|png|svg|jpg|jpeg|webp|css|js|map|txt|xml|webmanifest)$).*)',
  ],
};
