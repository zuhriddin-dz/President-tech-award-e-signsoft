'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleCheck, CircleX, RotateCcw, Wand2 } from 'lucide-react';

/**
 * The claim, running, above the fold.
 *
 * Every competitor's landing page can say "tamper-evident". None of them lets
 * you break it in the first five seconds. So the page does not describe the
 * proof — it hands the visitor the knife.
 *
 * The cryptography here is REAL, not a simulation. WebCrypto computes an
 * actual SHA-256 over the actual bytes on screen, and the "recorded" digest is
 * the genuine hash of the untouched text, taken once on mount. Nothing is
 * hardcoded to make the demonstration come out right; edit the text and the
 * fingerprint really does change.
 *
 * Client-side by design. It touches no API, no database and no production row,
 * so it cannot break because an envelope was deleted or a service was slow —
 * the one thing worse than a boring hero is a broken one during a demo.
 * Checking a REAL signed document against the real seal is /verify, reached
 * both from the button beside the main call to action and from this panel's
 * own footer — the second catches someone at the moment the demo lands.
 */
const CONTRACT = `SERVICE AGREEMENT

Between:  Orbis Logistics LLC
And:      Karimov Consulting

1. Term. Twelve months from 1 September 2026.
2. Fee.  18,400,000 so'm per month, payable in arrears.
3. Notice. Either party may terminate on 60 days' notice.

Signed electronically by both parties.`;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** The single character an attacker would most like to change. */
const TAMPERED = CONTRACT.replace('18,400,000', '1,400,000');

export function HeroProof() {
  const [text, setText] = useState(CONTRACT);
  const [sealed, setSealed] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);

  // The digest recorded "at signing" — the real hash of the untouched text.
  useEffect(() => {
    void sha256(CONTRACT).then(setSealed);
  }, []);

  useEffect(() => {
    void sha256(text).then(setCurrent);
  }, [text]);

  const intact = sealed !== null && current !== null && sealed === current;
  const tampered = text !== CONTRACT;

  const differsAt = useCallback((a: string, b: string) => {
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return i;
    return -1;
  }, []);
  const firstDiff = sealed && current ? differsAt(sealed, current) : -1;
  const changedChars =
    sealed && current
      ? sealed.split('').reduce((n, c, i) => (c === current[i] ? n : n + 1), 0)
      : 0;

  return (
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-white/15 bg-white/[0.04] text-left backdrop-blur">
      {/* Verdict bar */}
      <div
        className={`flex items-center gap-2.5 px-5 py-3 ${
          intact ? 'bg-success/15 text-white' : 'bg-danger/20 text-white'
        }`}
      >
        {intact ? (
          <CircleCheck className="h-5 w-5 shrink-0 text-hero-glow" />
        ) : (
          <CircleX className="h-5 w-5 shrink-0 text-white" />
        )}
        <span className="text-sm font-semibold">
          {intact ? 'Signature verified — document unaltered' : 'Verification failed — document has changed'}
        </span>
      </div>

      {/* The document */}
      <div className="px-5 pt-4">
        <label htmlFor="hero-doc" className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">
          Signed document
        </label>
        <textarea
          id="hero-doc"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={9}
          aria-label="Signed document — edit any character to see the fingerprint change"
          className="mt-1.5 w-full resize-none rounded-md border border-white/10 bg-brand-darkest/60 p-3 font-mono text-[11.5px] leading-relaxed text-white/85 outline-none focus-visible:border-hero-glow"
        />
      </div>

      {/* Fingerprints */}
      <div className="px-5 pt-3 pb-4">
        <p className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">
          SHA-256 fingerprint
        </p>
        <p className="mt-1 font-mono text-[11px] leading-relaxed break-all">
          {current === null ? (
            <span className="text-white/40">computing…</span>
          ) : (
            // Colour from the first differing character on: seeing exactly
            // where it diverges is the point — one edit, and nothing after it
            // survives.
            current.split('').map((c, i) => (
              <span
                key={i}
                className={
                  firstDiff >= 0 && i >= firstDiff ? 'text-danger-soft' : 'text-white/70'
                }
              >
                {c}
              </span>
            ))
          )}
        </p>
        {tampered && sealed && (
          <p className="mt-2 font-mono text-[11px] leading-relaxed break-all text-white/35">
            recorded at signing: {sealed}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-5 py-3.5">
        {!tampered ? (
          <button
            type="button"
            onClick={() => setText(TAMPERED)}
            className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/[0.18]"
          >
            <Wand2 className="h-4 w-4" />
            Change one number
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setText(CONTRACT)}
            className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/[0.18]"
          >
            <RotateCcw className="h-4 w-4" />
            Put it back
          </button>
        )}
        <span className="text-xs text-white/45">
          {tampered
            ? `One edit — and ${changedChars} of the 64 characters below it changed.`
            : 'Or edit the text yourself.'}
        </span>
        {/* Also a button beside the main CTA, and the repetition is deliberate:
            this one catches the visitor at the moment the demo has just landed,
            which is when someone holding a real document decides to try it. */}
        <Link
          href="/verify"
          className="ml-auto text-xs font-semibold text-hero-glow underline underline-offset-2 hover:text-white"
        >
          Check with a real file →
        </Link>
      </div>
    </div>
  );
}
