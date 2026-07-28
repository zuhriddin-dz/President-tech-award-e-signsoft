import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'eSignSoft',
  description: 'Documents that move themselves — secure e-signature and workflow automation.',
};

/**
 * Root layout holds only what EVERY route needs: the auth provider and the
 * document skeleton. Product chrome lives in app/(app)/layout.tsx, so the
 * full-bleed surfaces — the landing page, the tagging editor — render without
 * a navbar wrapped around them.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider signInFallbackRedirectUrl="/home" signUpFallbackRedirectUrl="/home">
      <html lang="en">
        <body className="min-h-screen">{children}</body>
      </html>
    </ClerkProvider>
  );
}
