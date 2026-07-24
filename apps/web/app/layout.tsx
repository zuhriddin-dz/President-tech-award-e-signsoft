import type { Metadata } from 'next';
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
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold tracking-tight text-ink">DocFlow</span>
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
          <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
