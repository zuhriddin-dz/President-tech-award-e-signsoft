'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FieldType } from '@docflow/contracts';
import { FIELD_META } from '@/lib/field-catalog';
import type { EditorField } from './editor';

/** Smallest a field may be dragged, as a fraction of the page. */
const MIN_W = 0.02;
const MIN_H = 0.012;

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number; // 1-based
  scale: number;
  fields: EditorField[]; // fields on THIS page
  selectedId: string | null;
  /** recipientKey → palette index, so colours stay stable across pages. */
  colorOf: (recipientKey: string) => number;
  onDropField: (type: FieldType, xFrac: number, yFrac: number) => void;
  onSelect: (id: string | null) => void;
  onChangeField: (id: string, patch: Partial<EditorField>) => void;
}

/**
 * One rendered PDF page (pdf.js → canvas) with an absolute overlay for fields.
 * Field coordinates are normalized (0..1, top-left) so they survive any zoom:
 * a field placed at 100% sits in exactly the same spot at 200%, and the
 * stamper reads the same numbers when it burns them into the sealed PDF.
 */
export function PdfPage({
  pdf,
  pageNumber,
  scale,
  fields,
  selectedId,
  colorOf,
  onDropField,
  onSelect,
  onChangeField,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

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
  }, [pdf, pageNumber, scale]);

  return (
    <div
      className="relative bg-white shadow-md ring-1 ring-border"
      style={{ width: size?.w, height: size?.h }}
    >
      <canvas ref={canvasRef} className="block" />
      <div
        data-page-overlay
        className="absolute inset-0"
        onMouseDown={(e) => {
          // A click on bare page area clears the selection.
          if (e.target === e.currentTarget) onSelect(null);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const type = e.dataTransfer.getData('application/x-docflow-field') as FieldType;
          if (!type || !FIELD_META[type]) return;
          const meta = FIELD_META[type];
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          const y = (e.clientY - rect.top) / rect.height;
          // The drop point is where the cursor is; centre the field on it.
          onDropField(type, x - meta.w / 2, y - meta.h / 2);
        }}
      >
        {fields.map((f) => (
          <FieldBox
            key={f.id}
            field={f}
            selected={f.id === selectedId}
            colorIndex={colorOf(f.recipientKey)}
            onSelect={() => onSelect(f.id)}
            onChange={(patch) => onChangeField(f.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldBox({
  field,
  selected,
  colorIndex,
  onSelect,
  onChange,
}: {
  field: EditorField;
  selected: boolean;
  colorIndex: number;
  onSelect: () => void;
  onChange: (patch: Partial<EditorField>) => void;
}) {
  const meta = FIELD_META[field.type];
  const color = `var(--color-rc-${(colorIndex % 6) + 1})`;

  /**
   * One pointer gesture handler for both moving and resizing. The overlay's
   * geometry is measured when the drag STARTS, not captured earlier, so a page
   * that re-rendered at a new zoom can't leave stale pixel maths behind.
   */
  function startGesture(e: React.MouseEvent, mode: 'move' | 'resize') {
    e.preventDefault();
    e.stopPropagation();
    onSelect();

    const overlay = (e.currentTarget as HTMLElement).closest('[data-page-overlay]');
    if (!overlay) return;
    const bounds = overlay.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { x: field.x, y: field.y, w: field.w, h: field.h };

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / bounds.width;
      const dy = (ev.clientY - startY) / bounds.height;
      if (mode === 'move') {
        onChange({
          x: clamp(origin.x + dx, 0, 1 - origin.w),
          y: clamp(origin.y + dy, 0, 1 - origin.h),
        });
      } else {
        onChange({
          w: clamp(origin.w + dx, MIN_W, 1 - origin.x),
          h: clamp(origin.h + dy, MIN_H, 1 - origin.y),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div
      onMouseDown={(e) => startGesture(e, 'move')}
      title={`${meta.label}${field.required ? ' (required)' : ''}`}
      className="absolute cursor-move rounded-[3px] border-2"
      style={{
        left: `${field.x * 100}%`,
        top: `${field.y * 100}%`,
        width: `${field.w * 100}%`,
        height: `${field.h * 100}%`,
        borderColor: color,
        background: `color-mix(in srgb, ${color} 20%, white 55%)`,
        outline: selected ? '2px solid var(--color-brand)' : undefined,
        outlineOffset: 1,
      }}
    >
      {field.type !== 'checkbox' && (
        <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-1 text-[10px] leading-none font-semibold whitespace-nowrap text-ink">
          {meta.hint ?? meta.label}
        </span>
      )}

      {/*
        Whose field this is, as a NUMBER — not only as a colour. Six colours
        cannot carry an identity on their own: they have to survive colour
        blindness, printing, and a sender who simply hasn't learned the key
        yet. The badge is the signal; the colour is the shortcut.
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-2 -left-2 grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-white ring-2 ring-white"
        style={{ background: color }}
      >
        {colorIndex + 1}
      </span>

      {/* A sender needs to see at a glance which boxes block completion. */}
      {field.required && (
        <span
          aria-hidden
          title="Required"
          className="pointer-events-none absolute -top-1 -right-1 h-2 w-2 rounded-full"
          style={{ background: color }}
        />
      )}

      {selected && (
        <span
          onMouseDown={(e) => startGesture(e, 'resize')}
          role="presentation"
          className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-se-resize rounded-sm border border-white bg-brand"
        />
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
