'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, PenLine, Type, Upload, X } from 'lucide-react';
import type { SignatureMethod } from '@docflow/contracts';
import { canvasToTrimmedPng, typedSignatureToPng, uploadedFileToPng } from '@/lib/signature-image';

/**
 * "Adopt your signature" — the DocuSign-style three-way chooser: type it, draw
 * it, or upload a picture. Output is one PNG data URL + the method. Ported from
 * tms's audited dialog. System handwriting faces only (no webfont: this is the
 * internet-facing box).
 */
export interface AdoptedSignature {
  dataUrl: string;
  method: SignatureMethod;
}

const FONTS = [
  { label: 'Signature', css: '"Segoe Script", "Brush Script MT", cursive' },
  { label: 'Formal', css: '"Palatino Linotype", Palatino, Georgia, serif' },
  { label: 'Casual', css: '"Comic Sans MS", "Segoe Print", cursive' },
];

type Tab = 'type' | 'draw' | 'upload';

export function AdoptSignatureDialog({
  defaultName,
  onAdopt,
  onClose,
}: {
  defaultName: string;
  onAdopt: (sig: AdoptedSignature) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('type');
  const [typed, setTyped] = useState(defaultName);
  const [fontIdx, setFontIdx] = useState(0);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const drawRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (tab !== 'draw') return;
    const canvas = drawRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a1d2e';
  }, [tab]);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function startStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = drawRef.current?.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function extendStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = drawRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  }
  function endStroke() {
    drawing.current = false;
  }
  function clearDrawing() {
    const canvas = drawRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      setUploadPreview(await uploadedFileToPng(file));
    } catch (err) {
      setUploadPreview(null);
      setError(err instanceof Error ? err.message : "Couldn't read that image.");
    } finally {
      setBusy(false);
    }
  }

  function adopt() {
    setError(null);
    try {
      if (tab === 'type') {
        const png = typedSignatureToPng(typed, FONTS[fontIdx]!.css);
        if (!png) return setError('Type your name first.');
        return onAdopt({ dataUrl: png, method: 'typed' });
      }
      if (tab === 'draw') {
        const png = drawRef.current ? canvasToTrimmedPng(drawRef.current) : null;
        if (!png) return setError('Draw your signature first.');
        return onAdopt({ dataUrl: png, method: 'drawn' });
      }
      if (!uploadPreview) return setError('Choose an image first.');
      return onAdopt({ dataUrl: uploadPreview, method: 'uploaded' });
    } catch {
      setError("Couldn't prepare that signature. Try another option.");
    }
  }

  const canAdopt =
    (tab === 'type' && typed.trim().length > 0) ||
    (tab === 'draw' && hasInk) ||
    (tab === 'upload' && Boolean(uploadPreview));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Adopt your signature"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-ink">Adopt your signature</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex gap-1 rounded-xl bg-surface-muted p-1">
            {(
              [
                { key: 'type', label: 'Type', icon: Type },
                { key: 'draw', label: 'Draw', icon: PenLine },
                { key: 'upload', label: 'Upload', icon: Upload },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  setError(null);
                }}
                aria-selected={tab === key}
                className={
                  'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ' +
                  (tab === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink')
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5">
          {tab === 'type' && (
            <div className="space-y-4">
              <label htmlFor="typed-name" className="block text-sm font-medium text-ink">
                Your full name
              </label>
              <input
                id="typed-name"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                maxLength={100}
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-[15px] outline-none focus:border-brand"
              />
              <div className="flex flex-wrap gap-2">
                {FONTS.map((f, i) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setFontIdx(i)}
                    className={
                      'rounded-lg border px-3 py-1.5 text-xs font-semibold ' +
                      (fontIdx === i ? 'border-brand bg-brand/10 text-brand' : 'border-border text-ink-muted')
                    }
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex h-28 items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface-muted px-4">
                <span className="truncate text-4xl text-ink" style={{ fontFamily: FONTS[fontIdx]!.css }}>
                  {typed.trim() || 'Your name'}
                </span>
              </div>
            </div>
          )}

          {tab === 'draw' && (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                Draw your signature — use a finger or stylus on touch devices.
              </p>
              <canvas
                ref={drawRef}
                onPointerDown={startStroke}
                onPointerMove={extendStroke}
                onPointerUp={endStroke}
                onPointerLeave={endStroke}
                className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-border bg-surface"
              />
              <button
                type="button"
                onClick={clearDrawing}
                className="text-sm font-semibold text-ink-muted hover:text-ink"
              >
                Clear
              </button>
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                Upload a photo or scan of your signature (PNG, JPG, or WebP, under 5&nbsp;MB).
              </p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void onPickFile(e)}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-brand"
              />
              <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface-muted">
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
                ) : uploadPreview ? (
                  <img src={uploadPreview} alt="Your signature" className="max-h-28 max-w-full object-contain" />
                ) : (
                  <span className="text-sm text-ink-muted">No image chosen</span>
                )}
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className="text-xs text-ink-muted">
            By adopting a signature you agree it is the electronic representation of your signature.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-muted hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={adopt}
              disabled={!canAdopt || busy}
              className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink hover:opacity-90 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Adopt and sign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
