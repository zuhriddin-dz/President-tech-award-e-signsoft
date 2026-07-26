'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Adopt a signature — Type or Draw — producing a PNG data URL. The canvas
 * re-encode is what the API validates server-side (isPng + dimension guard);
 * this is the honest-client convenience, not the security boundary.
 */
export function SignaturePad({ onChange }: { onChange: (v: { png: string; method: 'typed' | 'drawn' } | null) => void }) {
  const [mode, setMode] = useState<'type' | 'draw'>('type');
  const [typed, setTyped] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const W = 500;
  const H = 160;

  // Typed mode: render the name in a script-ish font onto the canvas.
  useEffect(() => {
    if (mode !== 'type') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (!typed.trim()) {
      onChange(null);
      return;
    }
    ctx.fillStyle = '#111827';
    ctx.font = '48px "Segoe Script", "Brush Script MT", cursive';
    ctx.textBaseline = 'middle';
    ctx.fillText(typed, 20, H / 2);
    onChange({ png: canvas.toDataURL('image/png'), method: 'typed' });
  }, [typed, mode, onChange]);

  function clearCanvas() {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, W, H);
    hasDrawn.current = false;
    onChange(null);
  }

  function pos(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        {(['type', 'draw'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              clearCanvas();
              if (m === 'draw') setTyped('');
            }}
            className={`rounded-md px-3 py-1 text-sm ${
              mode === m ? 'bg-brand text-brand-ink' : 'border border-border bg-surface text-ink'
            }`}
          >
            {m === 'type' ? 'Type' : 'Draw'}
          </button>
        ))}
      </div>

      {mode === 'type' && (
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value.slice(0, 60))}
          placeholder="Type your full name"
          className="mb-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-ink outline-none focus:border-brand"
        />
      )}

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full touch-none rounded-md border border-border bg-surface"
        style={{ cursor: mode === 'draw' ? 'crosshair' : 'default' }}
        onPointerDown={(e) => {
          if (mode !== 'draw') return;
          drawing.current = true;
          const ctx = canvasRef.current!.getContext('2d')!;
          const { x, y } = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#111827';
        }}
        onPointerMove={(e) => {
          if (mode !== 'draw' || !drawing.current) return;
          const ctx = canvasRef.current!.getContext('2d')!;
          const { x, y } = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          hasDrawn.current = true;
        }}
        onPointerUp={() => {
          if (mode !== 'draw') return;
          drawing.current = false;
          if (hasDrawn.current) onChange({ png: canvasRef.current!.toDataURL('image/png'), method: 'drawn' });
        }}
      />

      <div className="mt-2 flex justify-end">
        <button type="button" onClick={clearCanvas} className="text-sm text-ink-muted hover:text-ink">
          Clear
        </button>
      </div>
    </div>
  );
}
