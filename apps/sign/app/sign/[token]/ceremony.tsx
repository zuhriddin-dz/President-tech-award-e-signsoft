'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { CheckCircle2, FileSignature, Loader2, PenLine, ShieldAlert } from 'lucide-react';
import { SignerViewSchema, type SignerView, type TemplateField } from '@docflow/contracts';
import { autoValue, canFinish, fieldKey, fieldKind, signatureProgress, unsignedFields } from '@/lib/sign-fields';
import { AdoptSignatureDialog, type AdoptedSignature } from './adopt-signature-dialog';

/**
 * The public signing ceremony. Talks ONLY to this app's own /relay route, which
 * forwards to the API with a /sign/*-scoped credential — the browser never
 * learns the API's address and holds no credential but the token in its URL.
 *
 * Order matches ESIGN/UETA practice: the signer sees WHAT they are signing,
 * agrees to sign electronically (recorded server-side), and only then can place
 * a signature — so the evidence never claims a signature predating consent.
 * Ported from tms's audited ceremony; adapted to DocFlow's normalized field
 * coordinates and async completion (the sealed copy is emailed, not returned).
 */
const RENDER_WIDTH = 800;
type PageSize = { width: number; height: number; scale: number };

export function Ceremony({ token }: { token: string }) {
  const [view, setView] = useState<SignerView | null>(null);
  const [dead, setDead] = useState(false);
  const [rendering, setRendering] = useState(true);
  const [pages, setPages] = useState<PageSize[]>([]);

  const [consented, setConsented] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [agreeChecked, setAgreeChecked] = useState(false);

  const [adopted, setAdopted] = useState<AdoptedSignature | null>(null);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const pendingField = useRef<string | null>(null);
  const [filled, setFilled] = useState<Record<string, string>>({});

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const fields: TemplateField[] = useMemo(() => view?.fields ?? [], [view]);
  const signedOn = useMemo(() => new Date().toLocaleDateString(), []);

  // 1. Resolve the link (records the first view server-side).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/relay/${encodeURIComponent(token)}`, {
          headers: { accept: 'application/json' },
        });
        if (cancelled) return;
        if (!res.ok) return setDead(true);
        const parsed = SignerViewSchema.parse(await res.json());
        setView(parsed);
        if (parsed.completed) setDone(true);
        if (parsed.consentAt) setConsented(true);
      } catch {
        if (!cancelled) setDead(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Prefill everything we already know, once the document is known.
  useEffect(() => {
    if (!view) return;
    setFilled((prev) => {
      const next = { ...prev };
      fields.forEach((f, i) => {
        if (fieldKind(f) !== 'auto') return;
        const key = fieldKey(f, i);
        if (!next[key]) next[key] = autoValue(f, view, signedOn);
      });
      return next;
    });
  }, [view, fields, signedOn]);

  // 2. Open the PDF and measure its pages.
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    void (async () => {
      setRendering(true);
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        const doc = await pdfjs.getDocument({ url: `/relay/${encodeURIComponent(token)}/document`, withCredentials: true }).promise;
        if (cancelled) return;
        docRef.current = doc;
        const sizes: PageSize[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = RENDER_WIDTH / base.width;
          const vp = page.getViewport({ scale });
          sizes.push({ width: vp.width, height: vp.height, scale });
        }
        if (!cancelled) setPages(sizes);
      } catch {
        if (!cancelled) {
          setDead(true);
          setRendering(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, token]);

  // 3. Paint each page into its canvas.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || pages.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        for (let i = 0; i < pages.length; i++) {
          const canvas = canvasRefs.current[i];
          if (!canvas || cancelled) return;
          const page = await doc.getPage(i + 1);
          const viewport = page.getViewport({ scale: pages[i]!.scale });
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pages]);

  async function acceptConsent() {
    if (!agreeChecked) return;
    setConsentBusy(true);
    try {
      const res = await fetch(`/relay/${encodeURIComponent(token)}/consent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agreed: true }),
      });
      if (!res.ok) return setDead(true);
      setConsented(true);
    } catch {
      setDead(true);
    } finally {
      setConsentBusy(false);
    }
  }

  const openAdopt = useCallback((key: string) => {
    pendingField.current = key;
    setAdoptOpen(true);
  }, []);

  function onAdopt(sig: AdoptedSignature) {
    setAdopted(sig);
    setAdoptOpen(false);
    const key = pendingField.current;
    pendingField.current = null;
    // Adopt once, then fill the clicked field AND every other empty signature
    // field — the "adopt and sign" that removes hunting for each box.
    setFilled((prev) => {
      const next = { ...prev };
      if (key) next[key] = sig.dataUrl;
      fields.forEach((f, i) => {
        if (fieldKind(f) !== 'signature') return;
        const k = fieldKey(f, i);
        if (!next[k]) next[k] = sig.dataUrl;
      });
      return next;
    });
  }

  function onSignatureFieldClick(key: string) {
    if (!adopted) return openAdopt(key);
    setFilled((prev) => ({ ...prev, [key]: adopted.dataUrl }));
  }

  async function onFinish() {
    if (!adopted || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Non-signature values travel by field id; the signature image is sent
      // once (not repeated per field).
      const values: Record<string, string> = {};
      fields.forEach((f, i) => {
        if (fieldKind(f) === 'signature') return;
        const key = fieldKey(f, i);
        const v = filled[key];
        if (v) values[key] = v;
      });
      const res = await fetch(`/relay/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: adopted.method, signatureImage: adopted.dataUrl, fieldValues: values }),
      });
      if (!res.ok) {
        if (res.status === 404) return setDead(true);
        setSubmitError("We couldn't complete your signature. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setSubmitError("We couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const progress = signatureProgress(fields, filled);
  const ready = canFinish(fields, filled) && Boolean(adopted);

  function scrollToNextUnsigned() {
    const remaining = unsignedFields(fields, filled);
    if (remaining.length === 0) return;
    const target = remaining[0]!;
    const idx = fields.indexOf(target);
    document.getElementById(`field-${fieldKey(target, idx)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </span>
          <h1 className="mt-5 text-xl font-bold text-ink">Signed — you&apos;re all done</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Your signed copy and a Certificate of Completion will be emailed to{' '}
            <span className="font-medium text-ink">{view?.signerEmail}</span> shortly.
          </p>
          <p className="mt-6 border-t border-border pt-4 text-xs text-ink-muted">
            This signing link has now expired and cannot be opened again.
          </p>
        </div>
      </main>
    );
  }

  if (dead) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-ink-muted" />
          <h1 className="mt-4 text-lg font-bold text-ink">This signing link is not valid</h1>
          <p className="mt-2 text-sm text-ink-muted">
            It may have expired, already been used, or been withdrawn by the sender. If you were
            expecting to sign a document, ask the sender for a fresh link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <FileSignature className="h-5 w-5 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{view?.documentName ?? 'Document'}</p>
            {view && (
              <p className="truncate text-xs text-ink-muted">For {view.recipientName ?? view.signerEmail}</p>
            )}
          </div>
          {view && progress.total > 0 && consented && (
            <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
              {progress.done} of {progress.total} signed
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        {(!view || rendering) && (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading document…
          </p>
        )}

        <div className="space-y-4">
          {pages.map((p, i) => (
            <div
              key={i}
              className="relative mx-auto overflow-hidden rounded-lg bg-surface shadow-md"
              style={{ width: p.width, height: p.height }}
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current[i] = el;
                }}
              />
              {consented &&
                fields.map((f, fi) => {
                  if (f.page !== i + 1) return null;
                  const key = fieldKey(f, fi);
                  const kind = fieldKind(f);
                  const value = filled[key] ?? '';
                  // DocFlow coords are normalized (0..1) — multiply by page px.
                  const style = {
                    left: f.x * p.width,
                    top: f.y * p.height,
                    width: f.w * p.width,
                    height: f.h * p.height,
                  };

                  if (kind === 'signature') {
                    return (
                      <button
                        key={key}
                        id={`field-${key}`}
                        type="button"
                        onClick={() => onSignatureFieldClick(key)}
                        style={style}
                        className={
                          'absolute flex items-center justify-center rounded transition-colors ' +
                          (value
                            ? 'bg-transparent'
                            : 'animate-pulse border-2 border-brand bg-brand/20 text-[11px] font-bold text-brand hover:bg-brand/30')
                        }
                      >
                        {value ? (
                          <img src={value} alt="Your signature" className="h-full w-full object-contain" />
                        ) : (
                          <span className="flex items-center gap-1">
                            <PenLine className="h-3 w-3" />
                            {f.type === 'initial' ? 'Initial' : 'Sign'}
                          </span>
                        )}
                      </button>
                    );
                  }

                  if (kind === 'auto') {
                    return (
                      <div
                        key={key}
                        id={`field-${key}`}
                        style={style}
                        className="absolute flex items-center overflow-hidden whitespace-nowrap rounded bg-brand/5 px-1 text-[12px] text-ink"
                      >
                        {value}
                      </div>
                    );
                  }

                  if (f.type === 'checkbox') {
                    return (
                      <input
                        key={key}
                        id={`field-${key}`}
                        type="checkbox"
                        checked={value === 'true'}
                        onChange={(e) =>
                          setFilled((prev) => ({ ...prev, [key]: e.target.checked ? 'true' : '' }))
                        }
                        style={style}
                        className="absolute cursor-pointer accent-brand"
                      />
                    );
                  }

                  return (
                    <input
                      key={key}
                      id={`field-${key}`}
                      value={value}
                      maxLength={200}
                      placeholder={f.label ?? ''}
                      onChange={(e) => setFilled((prev) => ({ ...prev, [key]: e.target.value }))}
                      style={style}
                      className="absolute rounded border border-brand/50 bg-brand/5 px-1 text-[12px] text-ink outline-none focus:border-brand"
                    />
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {/* Consent gate — over the document, so the signer sees WHAT they agree to. */}
      {view && !consented && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-sm font-bold text-ink">Please review and agree before signing</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              By continuing you agree to sign this document electronically and that your electronic
              signature is as legally binding as a handwritten one. We record the time you opened
              this link, agreed, and signed, along with your IP address, as proof of signing.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={agreeChecked}
                  onChange={(e) => setAgreeChecked(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                I agree to sign electronically
              </label>
              <button
                type="button"
                onClick={() => void acceptConsent()}
                disabled={!agreeChecked || consentBusy}
                className="flex items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-brand-ink hover:opacity-90 disabled:opacity-50"
              >
                {consentBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action bar — appears once consent is recorded. */}
      {view && consented && !rendering && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <div className="min-w-0 flex-1">
              {ready ? (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Everything is signed
                </p>
              ) : (
                <button
                  type="button"
                  onClick={scrollToNextUnsigned}
                  className="text-sm font-semibold text-brand hover:underline"
                >
                  Next signature required →
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void onFinish()}
              disabled={!ready || submitting}
              className="flex items-center gap-2 rounded-lg bg-brand px-8 py-2.5 text-sm font-semibold text-brand-ink hover:opacity-90 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Finishing…' : 'Finish'}
            </button>
          </div>
          {submitError && (
            <p role="alert" className="mx-auto mt-2 max-w-4xl text-center text-xs font-medium text-danger">
              {submitError}
            </p>
          )}
          {ready && !submitError && (
            <p className="mx-auto mt-2 max-w-4xl text-center text-xs text-ink-muted">
              Finishing signs the document. The link expires once you finish.
            </p>
          )}
        </div>
      )}

      {adoptOpen && view && (
        <AdoptSignatureDialog
          defaultName={view.recipientName ?? view.signerEmail.split('@')[0]!}
          onAdopt={onAdopt}
          onClose={() => {
            pendingField.current = null;
            setAdoptOpen(false);
          }}
        />
      )}
    </main>
  );
}
