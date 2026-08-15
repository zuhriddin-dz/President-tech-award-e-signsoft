import Link from 'next/link';
import { Mark } from '@/components/brand/logo';
import { messages } from '@/lib/i18n/locale';
import { getLocale } from '@/lib/i18n/server';
import { LanguageSwitcher } from './language-switcher';
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
import { HeroProof } from './hero-proof';

/**
 * The call-to-action fill. brand-link rather than brand: at CTA size the label
 * matters more than the hue, and 6.47:1 beats brand's 4.70:1.
 */
const CTA = 'bg-brand-link hover:bg-brand-hover';

/**
 * The same fill ON the hero panel, which is nearly as dark as the button.
 * brand-link measures 2.22:1 there — under the 3:1 a control needs to read as
 * a shape — so the edge carries that instead: hero-glow is 8.62:1 against the
 * panel and 3.88:1 against the fill, which is what keeps the button a button.
 */
const CTA_ON_HERO = `${CTA} ring-1 ring-hero-glow`;

/**
 * Secondary actions on the hero. An outline rather than a fill so the one
 * primary CTA keeps its weight — white at 40% sits at roughly 4:1 against the
 * panel, so the control still reads as a shape without competing.
 */
const GHOST_ON_HERO =
  'inline-flex h-12 items-center gap-2 rounded-md px-6 text-[15px] font-semibold text-white ring-1 ring-white/40 transition-colors hover:bg-white/10';

/**
 * Public landing page — the first thing a logged-out visitor sees. It explains
 * the problem we solve, how the signing is secure, how documents are managed
 * end to end, and why to choose E-SIGNSOFT over paperwork. The CTA leads into the
 * personal-vs-company account choice at sign-up.
 */
export default async function LandingPage() {
  const { userId } = await auth();
  // The landing page is the ONLY translated surface. Everything past sign-up —
  // the editor, the signing ceremony, every email, the certificate — is
  // English, so the switcher deliberately does not follow the visitor in.
  const locale = await getLocale();
  const t = messages(locale);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
          <Link href="/" className="flex items-center gap-2">
            <Mark />
            <span className="text-xl font-bold tracking-tight text-ink">E-SIGNSOFT</span>
          </Link>
          <nav className="hidden gap-6 text-sm font-medium text-ink-muted md:flex">
            <a href="#problem" className="hover:text-ink">
              {t.nav.why}
            </a>
            <a href="#how" className="hover:text-ink">
              {t.nav.how}
            </a>
            <a href="#security" className="hover:text-ink">
              {t.nav.security}
            </a>
            <a href="#compare" className="hover:text-ink">
              {t.nav.compare}
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher current={locale} />
            {userId ? (
              <Link href="/home">
                <Button variant="primary" className={CTA}>{t.header.goToApp}</Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className="text-sm font-medium text-ink hover:text-brand">
                  {t.header.signIn}
                </Link>
                <Link href="/sign-up">
                  <Button variant="primary" className={CTA}>{t.header.getStarted}</Button>
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
            {t.hero.eyebrow}
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            {t.hero.title}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80">
            {t.hero.subtitle}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {userId ? (
              <>
                <Link href="/home">
                  <Button variant="primary" size="lg" className={CTA_ON_HERO}>
                    {t.hero.goToDashboard}
                  </Button>
                </Link>
                {/* Top-level, not buried in the demo: checking a document is a
                    real destination, and the visitor most likely to want it is
                    one who arrived holding a file rather than looking to buy. */}
                <Link href="/verify" className={GHOST_ON_HERO}>
                  <ShieldCheck className="h-4 w-4" />
                  {t.hero.checkDocument}
                </Link>
              </>
            ) : (
              <>
                <Link href="/sign-up">
                  <Button variant="primary" size="lg" className={CTA_ON_HERO}>
                    {t.hero.getStarted}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/verify" className={GHOST_ON_HERO}>
                  <ShieldCheck className="h-4 w-4" />
                  {t.hero.checkDocument}
                </Link>
                <Link href="/sign-in" className={GHOST_ON_HERO}>
                  {t.hero.signIn}
                </Link>
              </>
            )}
          </div>
          <p className="mt-5 text-sm text-white/60">
            {t.hero.noCreditCard}
          </p>

          {/* Not a screenshot and not a video — the real thing, hashing in the
              browser. Someone who breaks it themselves in the first five
              seconds does not need the rest of the page to believe us. */}
          <div className="mt-14">
            <p className="mb-4 text-sm font-semibold tracking-wide text-white/60 uppercase">
              {t.hero.tryIt}
            </p>
            {/*
              `key` is load-bearing, not decoration. The demo seeds React state
              from the contract text, and switching language re-renders this
              component WITHOUT resetting that state — every label flipped to
              the new language while the document in the textarea stayed in the
              old one. Keying by locale gives it a fresh instance instead, so
              the document, its recorded hash and any edits all reset together.
            */}
            <HeroProof key={locale} locale={locale} />
          </div>
        </div>
      </section>

      {/* The problem */}
      <section id="problem" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold text-ink">{t.problem.heading}</h2>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {(
            [
              [Clock, ...t.problem.chase],
              [FileSearch, ...t.problem.noProof],
              [X, ...t.problem.scattered],
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
          <h2 className="text-center text-3xl font-semibold text-ink">{t.how.heading}</h2>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                [Upload, ...t.how.upload],
                [FileSignature, ...t.how.tag],
                [ArrowRight, ...t.how.send],
                [ShieldCheck, ...t.how.prove],
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
        <h2 className="text-center text-3xl font-semibold text-ink">{t.security.heading}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-ink-muted">
          {t.security.subheading}
        </p>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {(
            [
              [ShieldCheck, ...t.security.tamper],
              [Lock, ...t.security.isolated],
              [FileSignature, ...t.security.surface],
              [Scale, ...t.security.legal],
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
          <h2 className="text-center text-3xl font-semibold text-ink">{t.compare.heading}</h2>
          <div className="mt-10 overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-3 font-medium text-ink-muted">&nbsp;</th>
                  <th className="px-5 py-3 font-medium text-ink-muted">{t.compare.columnPaper}</th>
                  <th className="px-5 py-3 font-semibold text-brand">E-SIGNSOFT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-ink">
                {(
                  [
                    t.compare.turnaround,
                    t.compare.integrity,
                    t.compare.audit,
                    t.compare.find,
                    t.compare.multiParty,
                    t.compare.cost,
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
        <h2 className="text-3xl font-semibold text-ink">{t.finalCta.heading}</h2>
        <p className="mx-auto mt-3 max-w-xl text-ink-muted">{t.finalCta.body}</p>
        {!userId && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/sign-up">
              <Button variant="primary" size="lg" className={CTA}>
                {t.finalCta.getStarted}
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
            E-SIGNSOFT
          </span>
          <span>{t.footer.tagline(new Date().getFullYear())}</span>
        </div>
      </footer>
    </div>
  );
}

