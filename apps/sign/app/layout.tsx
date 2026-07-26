import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sign document — DocFlow',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-border bg-surface px-6 py-3">
          <span className="text-lg font-semibold tracking-tight text-ink">DocFlow</span>
        </header>
        {children}
      </body>
    </html>
  );
}
