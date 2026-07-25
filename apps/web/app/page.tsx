import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { Button } from '@/components/ui/primitives';

/**
 * Public landing page — the first thing a logged-out visitor sees. It explains
 * the problem we solve, how the signing is secure, how documents are managed
 * end to end, and why to choose DocFlow over paperwork. The CTA leads into the
 * personal-vs-company account choice at sign-up.
 */
export default async function LandingPage() {
  const { userId } = await auth();

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <p className="text-sm font-medium text-brand">Documents that move themselves</p>
          <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Send, sign, and prove every document — without the paperwork
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
            DocFlow turns contracts, NDAs, onboarding and HR forms into secure, legally-defensible
            e-signatures — with a tamper-evident certificate on every one.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            {userId ? (
              <Link href="/dashboard">
                <Button>Go to your dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-up">
                  <Button>Get started free</Button>
                </Link>
                <Link href="/sign-in">
                  <Button variant="ghost">Sign in</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold text-ink">Paperwork is slow and risky</h2>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            ['Print, sign, scan, chase', 'Every signature is a round-trip of emails, printers and reminders. Deals wait on paper.'],
            ['No proof it wasn’t changed', 'A scanned PDF can be altered and no one can tell. Disputes come down to “trust me.”'],
            ['Nothing is organized', 'Signed files scatter across inboxes and drives. Finding one — or knowing its status — is a hunt.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border bg-surface p-5">
              <h3 className="font-medium text-ink">{title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How we manage documents end to end */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold text-ink">
            Every document, managed end to end
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['1 · Upload', 'Drop in any PDF and it becomes a reusable template.'],
              ['2 · Tag', 'Place signature, date, name and 9 more field types by drag-and-drop.'],
              ['3 · Send', 'Email a secure, single-use signing link — no account needed to sign.'],
              ['4 · Prove', 'Get the signed file plus a Certificate of Completion with a cryptographic seal.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-lg border border-border bg-surface p-5">
                <h3 className="font-medium text-brand">{title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold text-ink">Security is the product</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
          Signing is only worth something if it holds up. DocFlow is built so it does.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[
            ['Tamper-evident by design', 'Every signed document is fingerprinted (SHA-256) and sealed with an Ed25519 signature. Change one byte and verification fails.'],
            ['Isolated by the database itself', 'Your workspace’s data is walled off at the database layer, not just in code — so a bug can never leak it to another customer.'],
            ['A hardened signing surface', 'Signing links are single-use, expiring, and stored only as hashes. The public signing app holds no keys and no database.'],
            ['Legally aligned', 'Consent, a full audit trail, and identity anchoring follow the ESIGN/UETA model for remote electronic signatures.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border bg-surface p-5">
              <h3 className="font-medium text-ink">{title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why us vs paper */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold text-ink">DocFlow vs. paperwork</h2>
          <div className="mt-8 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted text-left text-ink-muted">
                  <th className="px-4 py-2 font-medium">&nbsp;</th>
                  <th className="px-4 py-2 font-medium">Paper / scans</th>
                  <th className="px-4 py-2 font-medium text-brand">DocFlow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-ink">
                {[
                  ['Turnaround', 'Days', 'Minutes'],
                  ['Proof of integrity', 'None', 'Cryptographic seal'],
                  ['Audit trail', 'Manual', 'Automatic'],
                  ['Find a signed doc', 'Search inboxes', 'One dashboard'],
                  ['Cost per signature', 'Print + postage', 'Free to start'],
                ].map(([label, paper, us]) => (
                  <tr key={label}>
                    <td className="px-4 py-2 text-ink-muted">{label}</td>
                    <td className="px-4 py-2">{paper}</td>
                    <td className="px-4 py-2 font-medium">{us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h2 className="text-2xl font-semibold text-ink">Start in a minute</h2>
        <p className="mx-auto mt-2 max-w-xl text-ink-muted">
          Choose a personal account or set up a company workspace — you pick at sign-up.
        </p>
        {!userId && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/sign-up">
              <Button>Get started free</Button>
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
