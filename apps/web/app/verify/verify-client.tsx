'use client';

import { useCallback, useRef, useState } from 'react';
import { CircleCheck, CircleX, FileUp, Loader2, ShieldCheck } from 'lucide-react';
import { PublicVerifyResultSchema, type PublicVerifyResult } from '@docflow/contracts';

type State =
  | { kind: 'idle' }
  | { kind: 'hashing'; name: string }
  | { kind: 'checking'; name: string; hash: string }
  | { kind: 'done'; name: string; hash: string; result: PublicVerifyResult }
  | { kind: 'error'; message: string };

/**
 * Hash in the BROWSER, send only the digest.
 *
 * The document never reaches our servers. That is a privacy decision before it
 * is a technical one: someone checking a contract they received has not agreed
 * to share it with us, and asking them to upload it to find out whether it is
 * intact would be a strange price for the answer. It also means there is no
 * upload size limit and the check is instant on a large file.
 *
 * crypto.subtle is only available over HTTPS (and on localhost), which is the
 * one environment note worth knowing if this is ever served over plain http.
 */
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function VerifyClient() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const check = useCallback(async (file: File) => {
    setState({ kind: 'hashing', name: file.name });
    try {
      const hash = await sha256Hex(file);
      setState({ kind: 'checking', name: file.name, hash });
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentHash: hash }),
      });
      if (res.status === 429) {
        setState({ kind: 'error', message: 'Too many checks from this network. Try again shortly.' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error', message: 'The check could not be completed. Try again.' });
        return;
      }
      const result = PublicVerifyResultSchema.parse(await res.json());
      setState({ kind: 'done', name: file.name, hash, result });
    } catch {
      setState({ kind: 'error', message: 'That file could not be read. Try selecting it again.' });
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void check(file);
    },
    [check],
  );

  const busy = state.kind === 'hashing' || state.kind === 'checking';

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragging ? 'border-brand bg-brand-soft' : 'border-border-strong bg-surface'
        }`}
      >
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileUp className="h-6 w-6" />}
        </span>
        <p className="mt-4 text-lg font-semibold text-ink">
          {state.kind === 'hashing'
            ? 'Reading the document…'
            : state.kind === 'checking'
              ? 'Checking the seal…'
              : 'Drop a signed document here'}
        </p>
        <p className="mt-1.5 text-sm text-ink-muted">
          or{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="font-semibold text-brand-link underline underline-offset-2 hover:text-brand-hover disabled:opacity-50"
          >
            choose a file
          </button>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void check(file);
            e.target.value = '';
          }}
        />
      </div>

      {state.kind === 'error' && (
        <p className="rounded-lg border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}

      {state.kind === 'done' && <Verdict state={state} />}
    </div>
  );
}

function Verdict({
  state,
}: {
  state: { name: string; hash: string; result: PublicVerifyResult };
}) {
  const { result, name, hash } = state;
  const ok = result.verified;
  return (
    <div
      className={`rounded-xl border p-6 ${
        ok ? 'border-success bg-success-soft' : 'border-danger bg-danger-soft'
      }`}
    >
      <div className="flex items-start gap-3">
        {ok ? (
          <CircleCheck className="mt-0.5 h-7 w-7 shrink-0 text-success" />
        ) : (
          <CircleX className="mt-0.5 h-7 w-7 shrink-0 text-danger" />
        )}
        <div className="min-w-0">
          <h2 className={`text-xl font-semibold ${ok ? 'text-success' : 'text-danger'}`}>
            {ok ? 'This document is intact' : 'No match for this file'}
          </h2>
          {ok ? (
            <p className="mt-1.5 text-sm text-ink">
              It was sealed by E-SIGNSOFT on{' '}
              <strong>{new Date(result.sealedAt!).toUTCString()}</strong> and has not changed by a
              single byte since.
            </p>
          ) : (
            /* Both cases give the same answer, and saying which would be a
               guess: a changed byte changes the fingerprint, so an altered
               document and one we never sealed are the same lookup miss. */
            <p className="mt-1.5 text-sm text-ink">
              We have no sealed document with this fingerprint. Either it was not signed through
              E-SIGNSOFT, or it has been altered since it was.
            </p>
          )}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-black/5 pt-4 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-muted">File</dt>
        <dd className="truncate font-medium text-ink">{name}</dd>
        <dt className="text-ink-muted">SHA-256</dt>
        <dd className="font-mono text-xs break-all text-ink">{hash}</dd>
        {ok && result.sealKid && (
          <>
            <dt className="text-ink-muted">Sealing key</dt>
            <dd className="font-mono text-xs text-ink">{result.sealKid}</dd>
          </>
        )}
        <dt className="text-ink-muted">Checked</dt>
        <dd className="text-ink">{new Date(result.checkedAt).toUTCString()}</dd>
      </dl>

      {ok && (
        <p className="mt-4 flex items-start gap-2 text-xs text-ink-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          The fingerprint above was computed on your own device. Your document was never uploaded.
        </p>
      )}
    </div>
  );
}
