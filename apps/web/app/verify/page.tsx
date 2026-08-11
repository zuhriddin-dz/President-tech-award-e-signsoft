import type { Metadata } from 'next';
import Link from 'next/link';
import { Mark } from '@/components/brand/logo';
import { VerifyClient } from './verify-client';

export const metadata: Metadata = {
  title: 'Verify a document — E-SIGNSOFT',
  description:
    'Check whether a signed document is unaltered. No account needed, and the file never leaves your device.',
};

/**
 * The public verification page.
 *
 * This is the product's central claim made usable. Sealing a document is only
 * worth something if the person holding it can check it, and that person is
 * usually the counterparty — someone with no account, no reason to make one,
 * and no reason to take our word for anything.
 *
 * Open to anyone by design (see middleware.ts), and it discloses nothing: a
 * fingerprint identifies one document and reveals none of its contents, so the
 * page can answer honestly without becoming a lookup table of other people's
 * agreements.
 */
export default function VerifyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Link href="/" className="flex items-center gap-2">
            <Mark />
            <span className="text-xl font-bold tracking-tight text-ink">E-SIGNSOFT</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Verify a document</h1>
        <p className="mt-3 max-w-xl text-ink-muted">
          Drop in a document that was signed through E-SIGNSOFT and we will tell you whether it is
          exactly as it was when it was signed. Change one byte and this fails.
        </p>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          No account needed. The file is fingerprinted on your own device — only the fingerprint is
          sent, never the document.
        </p>

        <div className="mt-10">
          <VerifyClient />
        </div>

        <section className="mt-14 border-t border-border pt-8">
          <h2 className="text-base font-semibold text-ink">How this works</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            When a document finishes signing we take a SHA-256 fingerprint of the completed file and
            sign that fingerprint with a private key, using Ed25519. The signature covers the
            fingerprint bound to that specific agreement and the moment it completed, so it cannot be
            moved onto a different document.
          </p>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            This page recomputes the fingerprint from the copy you hold and checks it against that
            signature. If anything in the file has changed, the fingerprint changes with it and there
            is nothing to match.
          </p>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-5 text-sm text-ink-muted">
          <Link href="/" className="hover:text-ink">
            E-SIGNSOFT
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
