import type { Metadata } from 'next';
import Link from 'next/link';
import { ClerkProvider, OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'DocFlow',
  description: 'Documents that move themselves — secure e-signature and workflow automation.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Clerk v7 removed the <SignedIn> wrapper — auth state is read server-side.
  const { userId } = await auth();

  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen">
          <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
                DocFlow
              </Link>
              {userId && (
                <nav className="flex items-center gap-3 text-sm text-ink-muted">
                  <Link href="/" className="hover:text-ink">
                    Dashboard
                  </Link>
                  <Link href="/templates" className="hover:text-ink">
                    Templates
                  </Link>
                </nav>
              )}
              {userId && (
                <OrganizationSwitcher
                  afterCreateOrganizationUrl="/"
                  afterSelectOrganizationUrl="/"
                  hidePersonal
                />
              )}
            </div>
            {userId && <UserButton />}
          </header>
          {/* No width constraint here — each page owns its container so the
              editor can go full-bleed while content pages stay centered. */}
          <main className="min-h-[calc(100vh-57px)]">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
