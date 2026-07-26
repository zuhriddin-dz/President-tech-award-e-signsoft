'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TemplateField } from '@docflow/contracts';

/**
 * One rendered PDF page with READ-ONLY field markers showing the signer where
 * their signature/date/etc. will be placed. (Placement + stamping happen
 * server-side in Phase 10; this is just orientation for the signer.)
 */
export function SignPage({
  pdf,
  pageNumber,
  fields,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  fields: TemplateField[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const scale = 1.2;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setSize({ w: viewport.width, h: viewport.height });
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  return (
    <div className="relative shadow-sm ring-1 ring-border" style={{ width: size?.w, height: size?.h }}>
      <canvas ref={canvasRef} className="block" />
      <div className="absolute inset-0">
        {fields.map((f) => (
          <div
            key={f.id}
            className="absolute rounded-sm border border-brand/60 bg-brand/10"
            style={{
              left: `${f.x * 100}%`,
              top: `${f.y * 100}%`,
              width: `${f.w * 100}%`,
              height: `${f.h * 100}%`,
            }}
          >
            <span className="pointer-events-none absolute left-0.5 top-0.5 text-[9px] text-brand">
              {f.type.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
