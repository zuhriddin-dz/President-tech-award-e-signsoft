'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  CircleCheck,
  Download,
  Loader2,
  PenLine,
  Printer,
  ShieldAlert,
  ShieldCheck,
  SquareStack,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { SignerViewSchema, type SignerView, type TemplateField } from '@docflow/contracts';
import {
  autoValue,
  canFinish,
  fieldKey,
  fieldKind,
  fieldLabel,
  unsignedFields,
} from '@/lib/sign-fields';
import { Mark } from '@/components/brand/logo';
import { AdoptSignatureDialog, type AdoptedSignature } from './adopt-signature-dialog';
import { CompletionFlow } from './completion-flow';

/**
 * The public signing ceremony. Talks ONLY to this app's own /relay route, which
 * forwards to the API with a /sign/*-scoped credential — the browser never
 * learns the API's address and holds no credential but the token in its URL.
 *
 * Order matches ESIGN/UETA practice: the signer sees WHAT they are signing,
 * agrees to sign electronically (recorded server-side), and only then can place
 * a signature — so the evidence never claims a signature predating consent.
 */
const BASE_WIDTH = 820;
const ZOOM_STEPS = [0.6, 0.8, 1, 1.25, 1.5, 2];

type PageSize = { width: number; height: number; scale: number };

export function Ceremony({ token }: { token: string }) {
  const [view, setView] = useState<SignerView | null>(null);
  const [dead, setDead] = useState(false);
  const [rendering, setRendering] = useState(true);
  const [pages, setPages] = useState<PageSize[]>([]);
  const [zoomIndex, setZoomIndex] = useState(2);

  const [consented, setConsented] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [agreeChecked, setAgreeChecked] = useState(false);

  const [adopted, setAdopted] = useState<AdoptedSignature | null>(null);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [artifactsReady, setArtifactsReady] = useState(false);
  const [showFieldList, setShowFieldList] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const pendingField = useRef<string | null>(null);
  const [filled, setFilled] = useState<Record<string, string>>({});

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const fields: TemplateField[] = useMemo(() => view?.fields ?? [], [view]);
  const signedOn = useMemo(() => new Date().toLocaleDateString(), []);
  const zoom = ZOOM_STEPS[zoomIndex]!;

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
        const doc = await pdfjs.getDocument({
          url: `/relay/${encodeURIComponent(token)}/document`,
          withCredentials: true,
        }).promise;
        if (cancelled) return;
        docRef.current = doc;
        const sizes: PageSize[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = (BASE_WIDTH * zoom) / base.width;
          const vp = page.getViewport({ scale });
          sizes.push({ width: vp.width, height: vp.height, scale });
        }
        if (!cancelled) {
          setPages(sizes);
          // Loading is done once pages are MEASURED — the canvas paints in the
          // next effect a beat later. Gating on the paint promise instead left
          // the loading text stuck over an already-rendered document.
          setRendering(false);
        }
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
  }, [view, token, zoom]);

  // 3. Paint each page into its canvas.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || pages.length === 0) return;
    let cancelled = false;
    void (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, [pages]);

  // Once signed, poll until the worker has sealed the PDF and built the
  // certificate, then reveal the downloads. Bounded so a stuck worker degrades
  // to "check your email" rather than spinning forever.
  useEffect(() => {
    if (!done || artifactsReady) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled || attempts >= 40) return;
      attempts += 1;
      try {
        const res = await fetch(`/relay/${encodeURIComponent(token)}/status`, {
          headers: { accept: 'application/json' },
        });
        if (res.ok) {
          const body = (await res.json()) as { ready?: boolean };
          if (body.ready) {
            if (!cancelled) setArtifactsReady(true);
            return;
          }
        }
      } catch {
        // Transient — just try again below.
      }
      if (!cancelled) setTimeout(() => void tick(), 1500);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [done, artifactsReady, token]);

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
        body: JSON.stringify({
          method: adopted.method,
          signatureImage: adopted.dataUrl,
          fieldValues: values,
        }),
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

  /** Everything the SIGNER has to deal with — auto fields are the server's. */
  const actionable = useMemo(() => fields.filter((f) => fieldKind(f) !== 'auto'), [fields]);
  const filledCount = actionable.filter((f) => filled[fieldKey(f, fields.indexOf(f))]).length;
  const remaining = unsignedFields(fields, filled);
  const ready = canFinish(fields, filled) && Boolean(adopted);

  const goToField = useCallback(
    (field: TemplateField) => {
      const key = fieldKey(field, fields.indexOf(field));
      setActiveField(key);
      document
        .getElementById(`field-${key}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [fields],
  );

  if (done) {
    return (
      <CompletionFlow
        token={token}
        documentName={view?.documentName ?? 'your document'}
        signerEmail={view?.signerEmail ?? ''}
        artifactsReady={artifactsReady}
      />
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
    <div className="flex h-screen flex-col">
      {/*
        ONE bar of chrome, not four. The document used to be fenced in on three
        sides — an instruction bar above, an icon rail to the right, a status
        bar below — which is a lot of furniture around the only thing the
        signer came here to read. Progress, navigation, tools and Finish all
        live in this single strip; the document gets everything else.
      */}
      <header className="flex shrink-0 flex-col gap-3 bg-brand-deep px-5 py-3 text-white lg:flex-row lg:items-center lg:gap-6">
        <Mark size={30} tone="inverse" className="hidden shrink-0 lg:block" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">
            {view?.documentName ?? 'Loading document…'}
          </p>

          {consented ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <div
                role="progressbar"
                aria-valuenow={filledCount}
                aria-valuemin={0}
                aria-valuemax={actionable.length}
                className="h-1.5 w-40 overflow-hidden rounded-full bg-white/25"
              >
                <div
                  className="h-full rounded-full bg-white transition-[width]"
                  style={{
                    width: `${
                      actionable.length === 0 ? 100 : (filledCount / actionable.length) * 100
                    }%`,
                  }}
                />
              </div>
              <span className="text-sm text-white/90">
                {filledCount} of {actionable.length} done
              </span>
              {remaining.length > 0 ? (
                <button
                  type="button"
                  onClick={() => remaining[0] && goToField(remaining[0])}
                  className="text-sm font-semibold text-white underline underline-offset-4 hover:opacity-80"
                >
                  Go to the next one
                </button>
              ) : (
                <span className="text-sm font-semibold text-white">
                  Everything&apos;s filled in — select Finish.
                </span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-white/80">
              Read it through, then agree at the bottom to start signing.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <BarButton
            label="Fields"
            icon={<SquareStack className="h-5 w-5" />}
            onClick={() => setShowFieldList((v) => !v)}
            active={showFieldList}
          />
          <BarButton
            label="Download"
            icon={<Download className="h-5 w-5" />}
            href={`/relay/${encodeURIComponent(token)}/document`}
          />
          <BarButton
            label="Print"
            icon={<Printer className="h-5 w-5" />}
            onClick={() => window.print()}
          />
          <BarButton
            label="Smaller"
            icon={<ZoomOut className="h-5 w-5" />}
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
          />
          <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <BarButton
            label="Bigger"
            icon={<ZoomIn className="h-5 w-5" />}
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
          />

          {consented && (
            <button
              type="button"
              onClick={() => void onFinish()}
              disabled={!ready || submitting}
              title={ready ? 'Sign and send' : 'Fill in every required field first'}
              className="ml-3 inline-flex h-11 items-center gap-2 rounded-md bg-brand px-8 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Finishing…' : 'Finish'}
            </button>
          )}
        </div>
      </header>

      {submitError && (
        <p
          role="alert"
          className="shrink-0 bg-danger px-5 py-2 text-center text-sm font-medium text-white"
        >
          {submitError}
        </p>
      )}

      {/* Document — full width, full height. */}
      <main className="thin-scroll relative min-h-0 flex-1 overflow-auto p-6">
        {(!view || rendering) && (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading document…
          </p>
        )}

        <div className="mx-auto flex w-fit flex-col gap-6">
          {pages.map((p, i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-lg bg-surface shadow-lg ring-1 ring-border"
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
                  const active = activeField === key;
                  // eSignSoft coords are normalized (0..1) — multiply by page px.
                  const style = {
                    left: f.x * p.width,
                    top: f.y * p.height,
                    width: f.w * p.width,
                    height: f.h * p.height,
                  };

                  if (kind === 'signature') {
                    return (
                      <SignatureBox
                        key={key}
                        id={`field-${key}`}
                        field={f}
                        value={value}
                        active={active}
                        style={style}
                        onClick={() => {
                          setActiveField(key);
                          onSignatureFieldClick(key);
                        }}
                      />
                    );
                  }

                  if (kind === 'auto') {
                    return (
                      <div
                        key={key}
                        id={`field-${key}`}
                        style={style}
                        title="Filled in by eSignSoft from the verified recipient"
                        className="absolute flex items-center overflow-hidden rounded bg-surface-sunken/70 px-1 text-[12px] whitespace-nowrap text-ink"
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
                        aria-label={fieldLabel(f)}
                        checked={value === 'true'}
                        onFocus={() => setActiveField(key)}
                        onChange={(e) =>
                          setFilled((prev) => ({ ...prev, [key]: e.target.checked ? 'true' : '' }))
                        }
                        style={style}
                        className="absolute cursor-pointer accent-brand"
                      />
                    );
                  }

                  if (f.type === 'dropdown' || f.type === 'radio') {
                    return (
                      <select
                        key={key}
                        id={`field-${key}`}
                        aria-label={fieldLabel(f)}
                        value={value}
                        onFocus={() => setActiveField(key)}
                        onChange={(e) => setFilled((prev) => ({ ...prev, [key]: e.target.value }))}
                        style={style}
                        className={`absolute rounded border bg-action-soft px-1 text-[12px] text-ink outline-none ${
                          active ? 'border-brand' : 'border-action'
                        }`}
                      >
                        <option value="">Choose…</option>
                        {(f.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    );
                  }

                  return (
                    <input
                      key={key}
                      id={`field-${key}`}
                      aria-label={fieldLabel(f)}
                      value={value}
                      maxLength={200}
                      inputMode={f.type === 'number' ? 'numeric' : undefined}
                      placeholder={f.required ? `${fieldLabel(f)} *` : fieldLabel(f)}
                      onFocus={() => setActiveField(key)}
                      onChange={(e) => setFilled((prev) => ({ ...prev, [key]: e.target.value }))}
                      style={style}
                      className={`absolute rounded border bg-action-soft px-1 text-[12px] text-ink outline-none placeholder:text-ink-faint ${
                        active ? 'border-brand' : 'border-action'
                      }`}
                    />
                  );
                })}
            </div>
          ))}
        </div>

        {/* The field list is an OVERLAY, not a permanent column: it is
            consulted occasionally, so it should not cost width all the time. */}
        {showFieldList && (
          <div className="absolute top-4 right-4 z-20 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-bold text-ink">Fields</h2>
              <button
                type="button"
                onClick={() => setShowFieldList(false)}
                aria-label="Close panel"
                className="rounded-md p-1 text-ink-muted hover:bg-surface-sunken"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="thin-scroll max-h-[60vh] overflow-y-auto p-2">
              {actionable.map((f) => {
                const key = fieldKey(f, fields.indexOf(f));
                const isDone = Boolean(filled[key]);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => goToField(f)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-brand-soft"
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                          isDone ? 'bg-success text-white' : 'bg-action-soft text-warning'
                        }`}
                      >
                        {isDone ? <CircleCheck className="h-3.5 w-3.5" /> : '!'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">{fieldLabel(f)}</span>
                      <span className="shrink-0 text-xs text-ink-muted">p{f.page}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </main>

      {/* Consent gate — under the document, so the signer sees WHAT they agree to. */}
      {view && !consented && (
        <div className="shrink-0 border-t border-border bg-surface px-6 py-5 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-4xl">
            <h2 className="flex items-center gap-2 font-bold text-ink">
              <ShieldCheck className="h-5 w-5 text-brand" />
              Please review and agree before signing
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              By continuing you agree to sign this document electronically and that your electronic
              signature is as legally binding as a handwritten one. We record the time you opened
              this link, agreed, and signed, along with your IP address, as proof of signing.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 text-sm font-medium text-ink">
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
                className="flex items-center gap-2 rounded-md bg-brand px-7 py-3 text-sm font-semibold text-brand-ink hover:bg-brand-hover disabled:opacity-50"
              >
                {consentBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border bg-surface px-6 py-2.5 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <Mark size={16} />
          Powered by eSignSoft
        </span>
        <span>·</span>
        <span>English (US)</span>
        <span>·</span>
        <a href="/terms" className="hover:text-ink">
          Terms of Use
        </a>
        <span>·</span>
        <a href="/privacy" className="hover:text-ink">
          Privacy
        </a>
        <span>·</span>
        <span>© {new Date().getFullYear()} eSignSoft</span>
      </footer>

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
    </div>
  );
}

/** A control in the dark bar: icon over label, legible on brand-deep. */
function BarButton({
  label,
  icon,
  onClick,
  href,
  active = false,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const cls =
    'inline-flex h-11 w-14 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium transition-colors ' +
    (active ? 'bg-white/20 text-white ' : 'text-white/85 hover:bg-white/15 hover:text-white ') +
    (disabled ? 'pointer-events-none opacity-40' : '');

  if (href) {
    return (
      <a href={href} className={cls} title={label}>
        {icon}
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} title={label}>
      {icon}
      {label}
    </button>
  );
}

/**
 * A signature box, before and after. Once filled it renders like the finished
 * document will — a bordered mark — so what the signer approves on screen is
 * what the sealed PDF shows.
 */
function SignatureBox({
  id,
  field,
  value,
  active,
  style,
  onClick,
}: {
  id: string;
  field: TemplateField;
  value: string;
  active: boolean;
  style: React.CSSProperties;
  onClick: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      style={style}
      aria-label={value ? 'Signature applied' : `Add your ${fieldLabel(field).toLowerCase()}`}
      className={
        'absolute flex items-center justify-center rounded transition-colors ' +
        (value
          ? `border ${active ? 'border-brand' : 'border-border-strong'} bg-surface/60`
          : 'border-2 border-action bg-action-soft text-[11px] font-bold text-warning hover:brightness-95')
      }
    >
      {value ? (
        <img src={value} alt="Your signature" className="h-full w-full object-contain p-0.5" />
      ) : (
        <span className="flex items-center gap-1">
          <PenLine className="h-3 w-3" />
          {field.type === 'initial' ? 'Initial' : field.type === 'stamp' ? 'Stamp' : 'Sign'}
        </span>
      )}
    </button>
  );
}
