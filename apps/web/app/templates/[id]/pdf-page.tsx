'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FieldType } from '@docflow/contracts';
import { FIELD_META } from '@/lib/field-catalog';
import type { EditorField } from './editor';

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number; // 1-based
  scale: number;
  fields: EditorField[]; // fields on THIS page
  selectedId: string | null;
  onDropField: (type: FieldType, xFrac: number, yFrac: number) => void;
  onSelect: (id: string) => void;
  onMoveField: (id: string, xFrac: number, yFrac: number) => void;
}

/**
 * One rendered PDF page (pdf.js → canvas) with an absolute overlay for fields.
 * Field coordinates are normalized (0..1, top-left) so they survive any scale;
 * the overlay maps them to pixels using the rendered page size.
 */
export function PdfPage({
  pdf,
  pageNumber,
  scale,
  fields,
  selectedId,
  onDropField,
  onSelect,
  onMoveField,
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

  function fracFromEvent(e: React.DragEvent | React.MouseEvent): { x: number; y: number } {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  return (
    <div className="relative shadow-sm ring-1 ring-border" style={{ width: size?.w, height: size?.h }}>
      <canvas ref={canvasRef} className="block" />
      {/* Overlay captures drops and hosts field boxes. */}
      <div
        className="absolute inset-0"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const type = e.dataTransfer.getData('application/x-docflow-field') as FieldType;
          if (!type) return;
          const meta = FIELD_META[type];
          const { x, y } = fracFromEvent(e);
          // Drop point is the field's CENTER; convert to top-left.
          onDropField(type, x - meta.w / 2, y - meta.h / 2);
        }}
      >
        {fields.map((f) => (
          <FieldBox
            key={f.id}
            field={f}
            selected={f.id === selectedId}
            onSelect={() => onSelect(f.id)}
            onMove={(x, y) => onMoveField(f.id, x, y)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldBox({
  field,
  selected,
  onSelect,
  onMove,
}: {
  field: EditorField;
  selected: boolean;
  onSelect: () => void;
  onMove: (xFrac: number, yFrac: number) => void;
}) {
  const meta = FIELD_META[field.type];
  const dragging = useRef<{ dx: number; dy: number } | null>(null);

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect();
        const parent = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        const box = e.currentTarget.getBoundingClientRect();
        dragging.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
        const onMoveWin = (ev: MouseEvent) => {
          if (!dragging.current) return;
          const x = (ev.clientX - parent.left - dragging.current.dx) / parent.width;
          const y = (ev.clientY - parent.top - dragging.current.dy) / parent.height;
          onMove(Math.min(1 - field.w, Math.max(0, x)), Math.min(1 - field.h, Math.max(0, y)));
        };
        const onUp = () => {
          dragging.current = null;
          window.removeEventListener('mousemove', onMoveWin);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMoveWin);
        window.addEventListener('mouseup', onUp);
      }}
      className={`absolute cursor-move rounded-sm border text-[10px] leading-none ${
        selected ? 'border-brand bg-brand/15' : 'border-brand/50 bg-brand/10'
      }`}
      style={{
        left: `${field.x * 100}%`,
        top: `${field.y * 100}%`,
        width: `${field.w * 100}%`,
        height: `${field.h * 100}%`,
      }}
    >
      <span className="pointer-events-none absolute left-0.5 top-0.5 truncate text-brand">
        {meta.label}
      </span>
    </div>
  );
}
