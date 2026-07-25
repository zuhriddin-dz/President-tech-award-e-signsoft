'use client';
import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Load a PDF (from the authenticated BFF URL) with pdf.js, once per url. The
 * worker is served from our own origin (no external calls — matches the app's
 * CSP posture). Same-origin fetch carries the session cookie automatically.
 */
export function usePdf(url: string): { pdf: PDFDocumentProxy | null; error: string | null } {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The loading task owns destroy(); keep it to tear down the worker.
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
        const loaded = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setPdf(loaded);
      } catch {
        if (!cancelled) setError('Could not load the document.');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  return { pdf, error };
}
