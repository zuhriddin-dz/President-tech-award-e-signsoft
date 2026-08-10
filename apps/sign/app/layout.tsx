import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sign document — E-SIGNSOFT',
  robots: { index: false, follow: false },
};

/**
 * NO ANALYTICS HERE, and that is a decision rather than an oversight.
 *
 * apps/web carries @vercel/analytics. This app does not, and should not.
 * Everyone who reaches it is a stranger in the middle of signing an
 * agreement, often one they did not choose to receive. Loading a third-party
 * script onto that page would put the timing and origin of individual signing
 * sessions in front of a company they never agreed to involve — while the
 * whole point of this app is that it holds nothing and does nothing else.
 *
 * Page-view counts for the marketing site are worth having. They are not
 * worth having here, and the numbers would be meaningless anyway: traffic is
 * one visit per invite, driven entirely by how much the product is used,
 * which apps/web already measures.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-border bg-surface px-6 py-3">
          <span className="text-lg font-semibold tracking-tight text-ink">E-SIGNSOFT</span>
        </header>
        {children}
      </body>
    </html>
  );
}
