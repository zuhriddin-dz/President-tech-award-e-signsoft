'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SignerViewSchema, type SignerView } from '@docflow/contracts';
import { usePdf } from '@/lib/use-pdf';
import { SignaturePad } from './signature-pad';
import { SignPage } from './sign-page';

type Adopted = { png: string; method: 'typed' | 'drawn' } | null;

/**
 * The signing ceremony. Operator: a first-time signer who has never seen the
 * product — the bar is: review, consent, sign, done. Everything goes through
 * the same-origin relay; this app holds no keys and no database.
 */
export function Ceremony({ token }: { token: string }) {
  const [view, setView] = useState<SignerView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [consented, setConsented] = useState(false);
  const [adopted, setAdopted] = useState<Adopted>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/relay/sign/${token}`, { cache: 'no-store' });
        if (!res.ok) {
          setLoadError(true);
          return;
        }
        setView(SignerViewSchema.parse(await res.json()));
      } catch {
        setLoadError(true);
      }
    })();
  }, [token]);

  const { pdf } = usePdf(`/relay/sign/${token}/document`);

  const onAdopt = useCallback((v: Adopted) => setAdopted(v), []);

  const pages = useMemo(
    () => (view ? Array.from({ length: view.pageCount }, (_, i) => i + 1) : []),
    [view],
  );

  async function submit() {
    if (!adopted || !consented) return;
    setSubmitState('submitting');
    try {
      const res = await fetch(`/relay/sign/${token}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ consent: true, method: adopted.method, signatureImage: adopted.png }),
      });
      setSubmitState(res.ok ? 'done' : 'error');
    } catch {
      setSubmitState('error');
    }
  }

  if (loadError) return <Centered title="This signing link is not valid." subtitle="It may have expired or already been used." />;
  if (!view) return <Centered title="Loading…" />;
  if (view.completed || submitState === 'done') {
    return (
      <Centered
        title="All done — thank you!"
        subtitle={`You've signed "${view.documentName}". A copy will be emailed to you shortly.`}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-ink">Review &amp; sign</h1>
        <p className="text-sm text-ink-muted">{view.documentName}</p>
      </div>

      {/* Document */}
      <div className="rounded-lg border border-border bg-surface-muted p-4">
        {!pdf ? (
          <p className="py-8 text-center text-sm text-ink-muted">Loading document…</p>
        ) : (
          <div className="mx-auto flex w-fit flex-col items-center gap-4">
            {pages.map((p) => (
              <SignPage key={p} pdf={pdf} pageNumber={p} fields={view.fields.filter((f) => f.page === p)} />
            ))}
          </div>
        )}
      </div>

      {/* Adopt signature */}
      <div className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-ink">Adopt your signature</h2>
        <SignaturePad onChange={onAdopt} />
      </div>

      {/* Consent + submit */}
      <div className="mt-6 rounded-lg border border-border bg-surface p-5">
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I agree to sign this document electronically, and that my electronic signature is the
            legal equivalent of my handwritten signature (ESIGN/UETA).
          </span>
        </label>
        {submitState === 'error' && (
          <p className="mt-3 text-sm text-danger">Something went wrong. Please try again.</p>
        )}
        <button
          onClick={submit}
          disabled={!consented || !adopted || submitState === 'submitting'}
          className="mt-4 rounded-md bg-brand px-5 py-2 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-50"
        >
          {submitState === 'submitting' ? 'Finishing…' : 'Finish signing'}
        </button>
      </div>
    </div>
  );
}

function Centered({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
    </div>
  );
}
