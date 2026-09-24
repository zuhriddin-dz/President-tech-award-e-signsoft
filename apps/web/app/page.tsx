import Link from 'next/link';
import { Inter, JetBrains_Mono, Onest } from 'next/font/google';
import { auth } from '@clerk/nextjs/server';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { Mark } from '@/components/brand/logo';
import { SignedDocument } from '@/components/landing/signed-document';
import { UseCases } from '@/components/landing/use-cases';
import { messages } from '@/lib/i18n/locale';
import { getLocale } from '@/lib/i18n/server';
import { LanguageSwitcher } from './language-switcher';
import { HeroProof } from './hero-proof';

/**
 * The landing page's own typography, and nowhere else's: Onest for display
 * sizes, Inter for everything a person reads or clicks, JetBrains Mono for
 * technical facts (fingerprints, ids, dates). Self-hosted by next/font,
 * because this app's CSP allows fonts from our own origin only — a Google
 * Fonts <link> would be blocked outright.
 *
 * Cyrillic is loaded because the page is also Russian; the Uzbek ʻ lives in
 * latin-ext.
 */
const display = Onest({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-onest',
  display: 'swap',
});
const ui = Inter({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

/** The landing's primary action: the seal colour, white label — 5.08:1 on it. */
const SEAL_CTA =
  'inline-flex items-center gap-2 rounded-2xl bg-seal px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-seal-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal';

/**
 * The technical path — verification. Same family of shapes, no fill: it leads
 * somewhere useful but it is not the thing we are selling, and giving it a
 * second accent colour would split the page's one signal in two.
 */
const QUIET_CTA =
  'inline-flex items-center gap-2 rounded-xl border border-hairline bg-page px-4 py-3 font-mono text-[13px] text-night transition-colors hover:border-quiet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal';

/** The compact control in the header: black, with the inset edge that lifts it. */
const NIGHT_CTA =
  'inline-flex items-center gap-2 rounded-xl bg-night px-4 py-2.5 text-sm font-medium text-white shadow-[inset_0_0_0_2px_rgba(255,255,255,0.13)] transition-colors hover:bg-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal';

/** A section eyebrow: mono, spaced, quiet — the label above every heading. */
const EYEBROW = 'font-mono text-[12px] tracking-[0.14em] uppercase';

/**
 * Public landing page — the first thing a logged-out visitor sees.
 *
 * White paper, black bands, and the magenta from the logo used only where
 * proof happens: the seal, the primary action, the mark beside each answer.
 * The signed-in product keeps its own sky-blue palette; the two never meet.
 */
export default async function LandingPage() {
  const { userId } = await auth();
  // The landing page is the ONLY translated surface. Everything past sign-up —
  // the editor, the signing ceremony, every email, the certificate — is
  // English, so the switcher deliberately does not follow the visitor in.
  const locale = await getLocale();
  const t = messages(locale);

  const solutions = [t.solutions.chase, t.solutions.noProof, t.solutions.who, t.solutions.scattered];
  const steps: [string, string][] = [t.how.upload, t.how.tag, t.how.send, t.how.prove];
  const cases = [
    { key: 'hr', label: t.useCases.hr[0], doc: t.useCases.hr[1], line: t.useCases.hr[2] },
    { key: 'rent', label: t.useCases.rent[0], doc: t.useCases.rent[1], line: t.useCases.rent[2] },
    { key: 'sales', label: t.useCases.sales[0], doc: t.useCases.sales[1], line: t.useCases.sales[2] },
    { key: 'legal', label: t.useCases.legal[0], doc: t.useCases.legal[1], line: t.useCases.legal[2] },
  ];
  const verifyFacts = [t.verify.fingerprint, t.verify.seal, t.verify.open, t.verify.oneByte];
  const securityFacts = [
    t.security.tamper,
    t.security.isolated,
    t.security.surface,
    t.security.legal,
  ];
  const compareRows = [
    t.compare.turnaround,
    t.compare.integrity,
    t.compare.audit,
    t.compare.find,
    t.compare.multiParty,
    t.compare.cost,
  ];
  const plans = [t.pricing.personal, t.pricing.company, t.pricing.scale];

  return (
    <div
      className={`${display.variable} ${ui.variable} ${mono.variable} landing-root font-ui flex min-h-screen flex-col bg-page`}
    >
      {/* One line above everything: what a visitor gets for nothing. */}
      <div className="bg-night px-6 py-2.5 text-center text-[13px] text-white">
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-seal align-middle" />
        {t.strip.text}{' '}
        <a href="#pricing" className="underline underline-offset-4 hover:opacity-80">
          {t.strip.cta}
        </a>
      </div>

      <header className="sticky top-0 z-30 border-b border-hairline bg-page/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Mark />
            <span className="text-[15px] font-bold tracking-[0.055em] text-night">E-SIGNSOFT</span>
          </Link>

          <nav className="mx-auto hidden gap-6 text-sm font-medium text-quiet lg:flex">
            <a href="#solutions" className="hover:text-night">
              {t.nav.solutions}
            </a>
            <a href="#use-cases" className="hover:text-night">
              {t.nav.useCases}
            </a>
            <a href="#verify" className="hover:text-night">
              {t.nav.verify}
            </a>
            <a href="#security" className="hover:text-night">
              {t.nav.security}
            </a>
            <a href="#pricing" className="hover:text-night">
              {t.nav.pricing}
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher current={locale} />
            {userId ? (
              <Link href="/home" className={NIGHT_CTA}>
                {t.header.goToApp}
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="hidden text-sm font-medium text-night hover:text-seal sm:inline"
                >
                  {t.header.signIn}
                </Link>
                <Link href="/sign-up" className={NIGHT_CTA}>
                  {t.header.getStarted}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero — a signed contract lying on the page, our seal pressed into
          it. Point at the sheet and the seal rises off the paper. */}
      <section className="border-b border-hairline bg-page">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
          <div className="flex flex-col items-start gap-6">
            <p className={`${EYEBROW} text-quiet`}>{t.hero.eyebrow}</p>
            <h1 className="font-display text-[clamp(2.35rem,6vw,4.35rem)] leading-[0.95] font-medium tracking-[-0.035em] text-balance text-night">
              {t.hero.title}
            </h1>
            <p className="max-w-[56ch] text-[17px] leading-relaxed text-body-ink">
              {t.hero.subtitle}
            </p>

            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {t.hero.proofs.map((proof, i) => (
                <li key={proof} className="flex items-center gap-2 text-sm font-medium text-night">
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-[6px] font-mono text-[10px] text-white ${
                      i === 2 ? 'bg-seal' : 'bg-night'
                    }`}
                  >
                    {i + 1}
                  </span>
                  {proof}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link href={userId ? '/home' : '/sign-up'} className={SEAL_CTA}>
                {userId ? t.hero.goToDashboard : t.hero.getStarted}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {/* Not buried in the demo: checking a document is a real
                  destination, and the visitor most likely to want it arrived
                  holding a file rather than looking to buy. */}
              <Link href="/verify" className={QUIET_CTA}>
                <ShieldCheck className="h-4 w-4 text-seal" />
                {t.hero.checkDocument}
              </Link>
            </div>

            <p className="text-sm text-quiet">{t.hero.noCreditCard}</p>
          </div>

          <SignedDocument title={t.heroDoc.title} signatureLabel={t.heroDoc.signedBy} />
        </div>
      </section>

      {/* Solutions — the problem quiet on the left, our answer carrying the
          weight on the right, separated by hairlines rather than cards. */}
      <section id="solutions" className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="flex max-w-[46ch] flex-col gap-4">
          <p className={`${EYEBROW} text-quiet`}>{t.nav.solutions}</p>
          <h2 className="font-display text-[clamp(1.9rem,4.2vw,3.25rem)] leading-[1.02] font-medium tracking-[-0.03em] text-balance text-night">
            {t.solutions.heading}
          </h2>
          <p className="text-[17px] leading-relaxed text-body-ink">{t.solutions.lede}</p>
        </div>

        <div className="mt-12 border-t border-hairline">
          {solutions.map(([problem, answer, body], i) => (
            <div
              key={problem}
              className="grid gap-4 border-b border-hairline py-7 lg:grid-cols-[1fr_1.15fr] lg:gap-14"
            >
              <div className="flex gap-3">
                <span className="pt-0.5 font-mono text-[13px] text-quiet">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="text-[17px] text-body-ink">{problem}</h3>
              </div>
              <div className="flex gap-3">
                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-[2px] bg-seal" />
                <div>
                  <h3 className="text-[17px] font-semibold text-night">{answer}</h3>
                  <p className="mt-1.5 text-[15px] text-quiet">{body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases — the same four steps, a different document on the sheet. */}
      <section id="use-cases" className="border-y border-hairline bg-mist">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="flex max-w-[46ch] flex-col gap-4">
            <p className={`${EYEBROW} text-quiet`}>{t.nav.useCases}</p>
            <h2 className="font-display text-[clamp(1.9rem,4.2vw,3.25rem)] leading-[1.02] font-medium tracking-[-0.03em] text-balance text-night">
              {t.useCases.heading}
            </h2>
            <p className="text-[17px] leading-relaxed text-body-ink">{t.useCases.lede}</p>
          </div>

          <UseCases cases={cases} steps={steps} />
        </div>
      </section>

      {/* Verify — the black band. The demo is the real thing, hashing in the
          browser: someone who breaks it themselves in the first five seconds
          does not need the rest of the page to believe us. */}
      <section id="verify" className="bg-night">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="flex max-w-[52ch] flex-col gap-4">
            <p className={`${EYEBROW} text-white/55`}>{t.nav.verify}</p>
            <h2 className="font-display text-[clamp(1.9rem,4.2vw,3.25rem)] leading-[1.02] font-medium tracking-[-0.03em] text-balance text-white">
              {t.verify.heading}
            </h2>
            <p className="text-[17px] leading-relaxed text-white/65">{t.verify.lede}</p>
          </div>

          <div className="mt-10 grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
            <div>
              <p className={`${EYEBROW} mb-4 text-white/55`}>{t.hero.tryIt}</p>
              {/*
                `key` is load-bearing, not decoration. The demo seeds React
                state from the contract text, and switching language re-renders
                this component WITHOUT resetting that state — every label
                flipped to the new language while the document in the textarea
                stayed in the old one. Keying by locale gives it a fresh
                instance instead, so the document, its recorded hash and any
                edits all reset together.
              */}
              <HeroProof key={locale} locale={locale} />
            </div>

            <ul className="flex flex-col gap-6">
              {verifyFacts.map(([title, body], i) => (
                <li key={title} className="grid grid-cols-[1.5rem_1fr] gap-3">
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-[7px] font-mono text-[11px] text-white ${
                      i === verifyFacts.length - 1 ? 'bg-seal' : 'bg-white/10'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold text-white">{title}</h3>
                    <p className="mt-1 text-sm text-white/60">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Security — the four facts, beside an extract of a real certificate.
          The extract stays in English: the certificate itself is English
          everywhere, so translating it here would promise something the PDF
          does not deliver. */}
      <section id="security" className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="flex max-w-[46ch] flex-col gap-4">
          <p className={`${EYEBROW} text-quiet`}>{t.nav.security}</p>
          <h2 className="font-display text-[clamp(1.9rem,4.2vw,3.25rem)] leading-[1.02] font-medium tracking-[-0.03em] text-balance text-night">
            {t.security.heading}
          </h2>
          <p className="text-[17px] leading-relaxed text-body-ink">{t.security.subheading}</p>
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div className="border-t border-hairline">
            {securityFacts.map(([title, body]) => (
              <div key={title} className="border-b border-hairline py-6">
                <h3 className="text-[17px] font-semibold text-night">{title}</h3>
                <p className="mt-2 max-w-[60ch] text-[15px] text-quiet">{body}</p>
              </div>
            ))}
          </div>

          <div className="h-fit rounded-2xl bg-graphite p-6 text-white">
            <p className={`${EYEBROW} text-white/50`}>Certificate of completion</p>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 font-mono text-[11.5px]">
              {[
                ['Request', '3f2f1a10-9c3b-4b2e-9d3e-2a1b3c4d5e6f'],
                ['Document', 'Service agreement · 3 pages'],
                ['Signer', 'karimov@example.uz'],
                ['Viewed', '12 Sep 2026 13:52:07 UTC · 84.54.11.20'],
                ['Agreed', '12 Sep 2026 13:54:41 UTC'],
                ['Signed', '12 Sep 2026 14:08:19 UTC · 84.54.11.20'],
                ['SHA-256', '4f9c2ab7e1d05c8f39b6a7c41e2d8f05b7c93a41d6e8f2b0c5a7193e4d2b6a12'],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-white/45">{k}</dt>
                  <dd className="m-0 break-all">{v}</dd>
                </div>
              ))}
              <dt className="text-white/45">Seal</dt>
              <dd className="m-0 text-valid">valid · key esignsoft-2026-01</dd>
            </dl>
          </div>
        </div>
      </section>

      {/* Compare — hairlines, no box. */}
      <section id="compare" className="border-y border-hairline bg-mist">
        <div className="mx-auto w-full max-w-4xl px-6 py-20">
          <h2 className="max-w-[46ch] font-display text-[clamp(1.9rem,4.2vw,3.25rem)] leading-[1.02] font-medium tracking-[-0.03em] text-balance text-night">
            {t.compare.heading}
          </h2>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-[15px]">
              <thead>
                <tr>
                  <th className="border-b border-hairline px-4 py-3 text-left font-mono text-[11px] font-normal tracking-[0.1em] text-quiet uppercase">
                    &nbsp;
                  </th>
                  <th className="border-b border-hairline px-4 py-3 text-left font-mono text-[11px] font-normal tracking-[0.1em] text-quiet uppercase">
                    {t.compare.columnPaper}
                  </th>
                  <th className="border-b border-hairline px-4 py-3 text-left font-mono text-[11px] font-normal tracking-[0.1em] text-night uppercase">
                    E-SIGNSOFT
                  </th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map(([label, paper, ours]) => (
                  <tr key={label}>
                    <td className="border-b border-hairline px-4 py-3.5 text-body-ink">{label}</td>
                    <td className="border-b border-hairline px-4 py-3.5 text-quiet">{paper}</td>
                    <td className="border-b border-hairline px-4 py-3.5 font-semibold text-night">
                      <span className="inline-flex items-center gap-2.5">
                        <Check className="h-4 w-4 text-seal" />
                        {ours}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing — three plans, the middle one carried by an outline rather
          than a colour, because the page has only one accent and it belongs
          to the seal. */}
      <section id="pricing" className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="flex max-w-[46ch] flex-col gap-4">
          <p className={`${EYEBROW} text-quiet`}>{t.nav.pricing}</p>
          <h2 className="font-display text-[clamp(1.9rem,4.2vw,3.25rem)] leading-[1.02] font-medium tracking-[-0.03em] text-balance text-night">
            {t.pricing.heading}
          </h2>
          <p className="text-[17px] leading-relaxed text-body-ink">{t.pricing.lede}</p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {plans.map(([name, price, cadence, blurb], i) => (
            <div
              key={name}
              className={`flex flex-col gap-3 rounded-2xl border bg-page p-6 ${
                i === 1 ? 'border-night shadow-[0_0_0_1px_var(--color-night)]' : 'border-hairline'
              }`}
            >
              <h3 className="text-[17px] font-semibold text-night">{name}</h3>
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[2rem] leading-none font-medium tracking-[-0.03em] text-night">
                  {price}
                </span>
                <span className="text-[13px] text-quiet">{cadence}</span>
              </p>
              <p className="text-[15px] text-quiet">{blurb}</p>
              <Link
                href={userId ? '/billing' : '/sign-up'}
                className={`mt-auto justify-center ${i === 1 ? SEAL_CTA : QUIET_CTA}`}
              >
                {t.pricing.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-[62ch] text-sm text-quiet">{t.pricing.note}</p>
      </section>

      {/* Final call to action — black, centred, one control. */}
      <section className="bg-night">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
          <h2 className="font-display text-[clamp(1.9rem,4.2vw,3.25rem)] leading-[1.02] font-medium tracking-[-0.03em] text-balance text-white">
            {t.finalCta.heading}
          </h2>
          <p className="text-[17px] leading-relaxed text-white/65">{t.finalCta.body}</p>
          <Link href={userId ? '/home' : '/sign-up'} className={SEAL_CTA}>
            {userId ? t.hero.goToDashboard : t.finalCta.getStarted}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-hairline bg-page">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-[13px] text-quiet">
          <span className="flex items-center gap-2 font-semibold text-night">
            <Mark size={22} />
            E-SIGNSOFT
          </span>
          <span>{t.footer.tagline(new Date().getFullYear())}</span>
          <nav className="flex flex-wrap gap-5">
            <Link href="/terms" className="hover:text-night">
              {t.footer.terms}
            </Link>
            <Link href="/privacy" className="hover:text-night">
              {t.footer.privacy}
            </Link>
            <Link href="/verify" className="hover:text-night">
              {t.footer.verify}
            </Link>
            <Link href="/help" className="hover:text-night">
              {t.footer.help}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
