'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A first-page (or nth-page) preview of a PDF, rendered on the client.
 *
 * Deliberately standalone rather than built on usePdf: a shelf can hold half a
 * dozen of these, and usePdf spins up a pdf.js worker per document that lives
 * as long as the hook does. Here the document is destroyed the moment its
 * bitmap is painted, so N thumbnails cost one worker at a time, not N.
 */
export function PdfThumbnail({
  url,
  page = 1,
  width = 320,
  className = '',
  alt,
}: {
  url: string;
  page?: number;
  width?: number;
  className?: string;
  alt: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        const loadingTask = pdfjs.getDocument({ url, withCredentials: true });
        task = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) return;

        const pageProxy = await doc.getPage(Math.min(page, doc.numPages));
        const base = pageProxy.getViewport({ scale: 1 });
        // Render at device resolution so the thumbnail isn't mushy on retina.
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const viewport = pageProxy.getViewport({ scale: (width / base.width) * dpr });
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.aspectRatio = `${base.width} / ${base.height}`;
        await pageProxy.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      } finally {
        // The bitmap is on the canvas now; the document (and its worker) is
        // dead weight from here on.
        void task?.destroy();
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url, page, width]);

  return (
    <div className={`relative overflow-hidden bg-surface ${className}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt}
        className={`block h-full w-full object-cover object-top transition-opacity ${
          state === 'ready' ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {state !== 'ready' && (
        <div className="absolute inset-0 grid place-items-center bg-surface-sunken">
          {state === 'error' ? (
            <span className="px-3 text-center text-xs text-ink-muted">Preview unavailable</span>
          ) : (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
          )}
        </div>
      )}
    </div>
  );
}
