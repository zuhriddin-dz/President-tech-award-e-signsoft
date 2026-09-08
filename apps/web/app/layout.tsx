import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/next';
import { cspMode } from '@/lib/security-headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'E-SIGNSOFT',
  description: 'Documents that move themselves — secure e-signature and workflow automation.',
};

/**
 * Root layout holds only what EVERY route needs: the auth provider and the
 * document skeleton. Product chrome lives in app/(app)/layout.tsx, so the
 * full-bleed surfaces — the landing page, the tagging editor — render without
 * a navbar wrapped around them.
 *
 * Analytics is on THIS app only, never on apps/sign. See the note there: the
 * signing app is reached by strangers in the act of signing an agreement, and
 * it carries no third-party script by design.
 */
/**
 * Reading a per-request header is what opts a route out of static rendering,
 * and this is the ROOT layout — so it would do that for every page, the
 * marketing landing page included. Guarded on the same switch the middleware
 * uses, evaluated at module scope: with WEB_CSP_MODE=off the header is never
 * read, no dynamic API is called, and static rendering is exactly as it was.
 *
 * The default (report-only) does make the app dynamic. That is the documented
 * cost of a nonce-based policy — Next says the same — and the escape hatch is
 * one variable. See DEPLOY.md.
 */
const CSP_ENABLED = cspMode(process.env.WEB_CSP_MODE) !== 'off';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The per-request CSP nonce, minted in middleware. Clerk injects its own
  // script tag, so it has to be told the nonce or `strict-dynamic` blocks
  // clerk-js and every auth screen renders empty. Passed even while the policy
  // is report-only, so switching it to enforcing changes nothing but the header.
  const nonce = CSP_ENABLED ? ((await headers()).get('x-nonce') ?? undefined) : undefined;

  return (
    <ClerkProvider
      nonce={nonce}
      signInFallbackRedirectUrl="/home"
      signUpFallbackRedirectUrl="/home"
    >
      <html lang="en">
        <body className="min-h-screen">
          {children}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
