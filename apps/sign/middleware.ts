import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers for the public signing service. Note what is NOT here: any
 * authentication gate. This app has no sessions, no cookies, no login — the
 * signing token in the URL is the only credential, and the main API is the sole
 * authority on whether it is valid. Lifted from tms-platform's audited sign app.
 */
export const runtime = 'nodejs';

// Headers a client might try to smuggle inbound, in two families.
//
// IDENTITY-SHAPED: anything that would be read as "who is this" downstream. The
// relay builds its upstream headers from an allowlist anyway — defense in depth.
//
// ADDRESS-SHAPED: the headers a reverse proxy would use to state the original
// client address. Nothing in front of this app sets them on Vercel, so any that
// arrive were written by the caller — and the value ends up on a Certificate of
// Completion as evidence. They are deleted here so no future edit can casually
// read one; the relay derives the address from platform-set headers instead
// (see clientIp() there). A deployment that really does sit behind a CDN names
// its header in TRUSTED_CLIENT_IP_HEADER, which is checked BEFORE this strip
// list can matter, because the strip happens on the request the relay then
// reads — so the named header is exempted below.
const DANGEROUS_INBOUND =
  /^(x-tenant-|x-internal-auth$|x-client-ip$|x-forwarded-(auth|authorization|user|email|role|roles|permissions)$|authorization$)/i;

const FORGEABLE_ADDRESS_HEADERS = new Set([
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
  'fastly-client-ip',
  'x-cluster-client-ip',
  'x-client-ip',
]);

/** The one address header this deployment has decided to believe, if any. */
const TRUSTED_ADDRESS_HEADER = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();

function buildCsp(nonce: string): string {
  const devEval = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    // The document's bytes come from this same origin via /relay — no storage
    // origin and no main-API origin the browser ever talks to.
    `connect-src 'self'`,
    // pdf.js renders in a Web Worker served from our own origin.
    `worker-src 'self' blob:`,
    `frame-ancestors 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  for (const key of [...requestHeaders.keys()]) {
    const name = key.toLowerCase();
    if (name === TRUSTED_ADDRESS_HEADER) continue; // vouched for by the CDN in front
    if (DANGEROUS_INBOUND.test(key) || FORGEABLE_ADDRESS_HEADERS.has(name)) {
      requestHeaders.delete(key);
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);
  requestHeaders.set('x-nonce', nonce);
  // Next reads the nonce from the CSP on the REQUEST headers to stamp its own
  // injected bootstrap scripts; without this, strict-dynamic blocks them and
  // the "use client" ceremony never hydrates.
  requestHeaders.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  // Stricter than the app default: the signing token lives in the URL path, so
  // no navigation away may carry it in a Referer.
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:ico|svg|png|jpg|jpeg|gif|webp|txt|xml|mjs|webmanifest)$).*)',
  ],
};
