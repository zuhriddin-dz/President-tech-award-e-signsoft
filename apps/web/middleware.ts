import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

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

// Everything except the auth pages requires a session. The BFF /api routes
// are protected too — they forward the caller's own token, never a shared one.
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
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
