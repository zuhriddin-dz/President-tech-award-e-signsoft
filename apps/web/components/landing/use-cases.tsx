'use client';

import { useState } from 'react';

export interface UseCase {
  key: string;
  /** Tab label — the industry, not the document. */
  label: string;
  /** The example document's title, shown on the drawn sheet. */
  doc: string;
  /** Why it matters in that trade, in one sentence. */
  line: string;
}

/**
 * Use cases: the same four steps every time, with the document swapped.
 *
 * The tabs change ONE thing — which document is on the sheet — because that is
 * the honest claim. Pretending the flow differs per industry would be a
 * different product; showing the same steps under a lease and under an offer
 * letter is the point.
 *
 * A client component only for the selection state. The copy arrives already
 * translated from the server, so no catalogue crosses into the browser bundle.
 */
export function UseCases({ cases, steps }: { cases: UseCase[]; steps: [string, string][] }) {
  const [active, setActive] = useState(cases[0]?.key ?? '');
  const current = cases.find((c) => c.key === active) ?? cases[0];
  if (!current) return null;

  return (
    <>
      <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label={current.label}>
        {cases.map((c) => {
          const selected = c.key === current.key;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              id={`case-tab-${c.key}`}
              aria-selected={selected}
              aria-controls="case-panel"
              onClick={() => setActive(c.key)}
              className={
                'rounded-full border px-4 py-2 text-sm font-medium transition-colors ' +
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal ' +
                (selected
                  ? 'border-night bg-night text-white'
                  : 'border-hairline bg-page text-quiet hover:text-night')
              }
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div
        id="case-panel"
        role="tabpanel"
        aria-labelledby={`case-tab-${current.key}`}
        className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14"
      >
        {/* The steps never change — only the paper does. */}
        <ol className="flex flex-col border-t border-hairline">
          {steps.map(([title, body], i) => (
            <li key={title} className="grid grid-cols-[2rem_1fr] gap-3 border-b border-hairline py-4">
              <span className="pt-0.5 font-mono text-xs text-seal">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-ui text-[15px] font-semibold text-night">{title}</h3>
                <p className="mt-1 text-sm text-quiet">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* The example document, drawn — same paper as the hero, smaller. */}
        <div className="rounded-2xl border border-hairline bg-page p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_10px_28px_rgba(0,0,0,0.05)]">
          <p className="font-mono text-[10px] tracking-[0.18em] text-quiet uppercase">
            {current.label}
          </p>
          <h3 className="mt-2 font-display text-xl font-semibold tracking-tight text-night">
            {current.doc}
          </h3>

          <div className="mt-5 flex flex-col gap-2.5">
            {[94, 86, 91, 68].map((w, i) => (
              <span
                key={i}
                className="block h-[7px] rounded-full bg-night/[0.085]"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <span className="rounded-lg border border-dashed border-rc-1 bg-rc-1/[0.06] px-3 py-2.5 font-mono text-[11px] text-body-ink">
              Signature
            </span>
            {/* rc-3, not rc-2: the orange recipient colour and the seal's
                magenta converge under tritanopia, and this sits a few
                centimetres from the seal. contrast.spec.ts pins the pair. */}
            <span className="rounded-lg border border-dashed border-rc-3 bg-rc-3/[0.06] px-3 py-2.5 font-mono text-[11px] text-body-ink">
              Date signed
            </span>
          </div>

          <p className="mt-5 border-t border-hairline pt-4 text-sm text-body-ink">{current.line}</p>
        </div>
      </div>
    </>
  );
}
