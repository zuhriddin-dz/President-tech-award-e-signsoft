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
]);

// Everything except the auth pages requires a session. The BFF /api routes
// are protected too — they forward the caller's own token, never a shared one.
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next|.*\\.(?:ico|png|svg|jpg|jpeg|webp|css|js|map|txt|xml|webmanifest)$).*)'],
};
