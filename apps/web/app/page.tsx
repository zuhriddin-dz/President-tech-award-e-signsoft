import Link from 'next/link';
import { Mark } from '@/components/brand/logo';
import { auth } from '@clerk/nextjs/server';
import {
  ArrowRight,
  Check,
  Clock,
  FileSearch,
  FileSignature,
  Lock,
  Scale,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/primitives';

/**
 * Public landing page — the first thing a logged-out visitor sees. It explains
 * the problem we solve, how the signing is secure, how documents are managed
 * end to end, and why to choose eSignSoft over paperwork. The CTA leads into the
 * personal-vs-company account choice at sign-up.
 */
export default async function LandingPage() {
  const { userId } = await auth();

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
          <Link href="/" className="flex items-center gap-2">
            <Mark />
            <span className="text-xl font-bold tracking-tight text-ink">eSignSoft</span>
          </Link>
          <nav className="hidden gap-6 text-sm font-medium text-ink-muted md:flex">
            <a href="#problem" className="hover:text-ink">
              Why eSignSoft
            </a>
            <a href="#how" className="hover:text-ink">
              How it works
            </a>
            <a href="#security" className="hover:text-ink">
              Security
            </a>
            <a href="#compare" className="hover:text-ink">
              Compare
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {userId ? (
              <Link href="/home">
                <Button variant="dark">Go to eSignSoft</Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="text-sm font-medium text-ink hover:text-brand">
                  Sign in
                </Link>
                <Link href="/sign-up">
                  <Button variant="dark">Get started free</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-hero-from to-hero-to">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center">
          <p className="text-sm font-semibold tracking-wide text-white/70 uppercase">
            Documents that move themselves
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Send, sign, and prove every document — without the paperwork
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80">
            eSignSoft turns contracts, NDAs, onboarding and HR forms into secure, legally-defensible
            e-signatures — with a tamper-evident certificate on every one.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {userId ? (
              <Link href="/home">
                <Button size="lg" className="bg-white text-brand hover:bg-white/90">
                  Go to your dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-up">
                  <Button size="lg" className="bg-white text-brand hover:bg-white/90">
                    Get started free
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/sign-in">
                  <span className="inline-flex h-12 items-center rounded-md px-6 text-[15px] font-semibold text-white ring-1 ring-white/40 transition-colors hover:bg-white/10">
                    Sign in
                  </span>
                </Link>
              </>
            )}
          </div>
          <p className="mt-5 text-sm text-white/60">
            No credit card. Signers never need an account.
          </p>
        </div>
      </section>

      {/* The problem */}
      <section id="problem" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold text-ink">Paperwork is slow and risky</h2>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {(
            [
              [
                Clock,
                'Print, sign, scan, chase',
                'Every signature is a round-trip of emails, printers and reminders. Deals wait on paper.',
              ],
              [
                FileSearch,
                'No proof it wasn’t changed',
                'A scanned PDF can be altered and nobody can tell. Disputes come down to “trust me”.',
              ],
              [
                X,
                'Nothing is organised',
                'Signed files scatter across inboxes and drives. Finding one — or knowing its status — is a hunt.',
              ],
            ] as const
          ).map(([Icon, title, body]) => (
            <div key={title} className="rounded-xl border border-border bg-surface p-6">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-danger-soft text-danger">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 text-sm text-ink-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border bg-surface-muted">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-semibold text-ink">
            Every document, managed end to end
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                [Upload, '1 · Upload', 'Drop in any PDF and it becomes a reusable template.'],
                [
                  FileSignature,
                  '2 · Tag',
                  'Place signature, date, name and 14 more field types by drag-and-drop — per recipient.',
                ],
                [
                  ArrowRight,
                  '3 · Send',
                  'Email a secure, single-use signing link. No account needed to sign.',
                ],
                [
                  ShieldCheck,
                  '4 · Prove',
                  'Get the signed file plus a Certificate of Completion with a cryptographic seal.',
                ],
              ] as const
            ).map(([Icon, title, body]) => (
              <div key={title} className="rounded-xl border border-border bg-surface p-6">
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold text-brand">{title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold text-ink">Security is the product</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
          Signing is only worth something if it holds up. eSignSoft is built so it does.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {(
            [
              [
                ShieldCheck,
                'Tamper-evident by design',
                'Every signed document is fingerprinted (SHA-256) and sealed with an Ed25519 signature bound to that document. Change one byte and verification fails — and you can run that check yourself, any time.',
              ],
              [
                Lock,
                'Isolated by the database itself',
                'Your workspace’s data is walled off at the database layer, not just in application code — so a bug in our code can never leak it to another customer.',
              ],
              [
                FileSignature,
                'A hardened signing surface',
                'Signing links are single-use, expiring, and stored only as hashes. The public signing app holds no keys and no database; it can forward a fixed set of requests and nothing else.',
              ],
              [
                Scale,
                'Legally aligned',
                'Consent is recorded before any field can be filled, and the full audit trail — opened, agreed, signed, from where — follows the ESIGN/UETA model for remote electronic signatures.',
              ],
            ] as const
          ).map(([Icon, title, body]) => (
            <div key={title} className="flex gap-4 rounded-xl border border-border bg-surface p-6">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Compare */}
      <section id="compare" className="border-y border-border bg-surface-muted">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-center text-3xl font-semibold text-ink">eSignSoft vs. paperwork</h2>
          <div className="mt-10 overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-3 font-medium text-ink-muted">&nbsp;</th>
                  <th className="px-5 py-3 font-medium text-ink-muted">Paper / scans</th>
                  <th className="px-5 py-3 font-semibold text-brand">eSignSoft</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-ink">
                {(
                  [
                    ['Turnaround', 'Days', 'Minutes'],
                    ['Proof of integrity', 'None', 'Cryptographic seal'],
                    ['Audit trail', 'Manual', 'Automatic'],
                    ['Find a signed doc', 'Search inboxes', 'One dashboard'],
                    ['Multi-party signing', 'Chase each person', 'Routed automatically'],
                    ['Cost per signature', 'Print + postage', 'Free to start'],
                  ] as const
                ).map(([label, paper, us]) => (
                  <tr key={label}>
                    <td className="px-5 py-3 text-ink-muted">{label}</td>
                    <td className="px-5 py-3">{paper}</td>
                    <td className="px-5 py-3 font-semibold">
                      <span className="inline-flex items-center gap-2">
                        <Check className="h-4 w-4 text-success" />
                        {us}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h2 className="text-3xl font-semibold text-ink">Start in a minute</h2>
        <p className="mx-auto mt-3 max-w-xl text-ink-muted">
          Choose a personal account or set up a company workspace — you pick at sign-up, and it
          decides who else can see your agreements.
        </p>
        {!userId && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/sign-up">
              <Button variant="dark" size="lg">
                Get started free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </section>

      <footer className="border-t border-border bg-surface-muted">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-ink-muted">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <Mark />
            eSignSoft
          </span>
          <span>© {new Date().getFullYear()} eSignSoft — secure e-signature and document workflow</span>
        </div>
      </footer>
    </div>
  );
}

