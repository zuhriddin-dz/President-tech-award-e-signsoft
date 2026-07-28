'use client';
import { useState } from 'react';
import type { SignatureRequestDetail, VerifyResult } from '@docflow/contracts';
import { Button } from '@/components/ui/primitives';
import { verifyRequest } from '@/lib/client';

/**
 * Tamper evidence. "Verify" asks the server to re-read the stored signed PDF,
 * re-hash it, and check the Ed25519 seal — two independent claims: the bytes
 * are the ones that were signed, and this server sealed them for THIS request
 * at THAT time.
 */
export function VerifyPanel({
  requestId,
  detail,
}: {
  requestId: string;
  detail: SignatureRequestDetail;
}) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await verifyRequest(requestId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed to run.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-ink">Tamper evidence</h2>
        <Button variant="ghost" onClick={run} disabled={busy || !detail.hasSignedPdf}>
          {busy ? 'Checking…' : 'Verify document'}
        </Button>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div>
          <p className="text-sm text-ink-muted">SHA-256 of the signed document</p>
          <p className="mt-1 break-all font-mono text-xs text-ink">{detail.documentHash ?? '—'}</p>
        </div>
        <div>
          <p className="text-sm text-ink-muted">
            Server seal {detail.sealKid ? `(Ed25519, key ${detail.sealKid})` : ''}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Re-hashing the stored file and checking it against the seal proves the document has not
            been altered since signing.
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {result && (
          <div
            className={`rounded-md border p-3 ${
              result.valid ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'
            }`}
          >
            <p className={`text-sm font-semibold ${result.valid ? 'text-success' : 'text-danger'}`}>
              {result.valid ? 'Valid — the document is unaltered' : 'INVALID — do not rely on this file'}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-ink-muted">
              <li>
                Hash matches the record:{' '}
                <span className={result.hashMatches ? 'text-success' : 'text-danger'}>
                  {result.hashMatches ? 'yes' : 'no'}
                </span>
              </li>
              <li>
                Seal verifies:{' '}
                <span className={result.sealValid ? 'text-success' : 'text-danger'}>
                  {result.sealValid ? 'yes' : 'no'}
                </span>
              </li>
              <li>Checked {new Date(result.checkedAt).toLocaleString()}</li>
            </ul>
            {!result.hashMatches && result.computedHash && (
              <p className="mt-2 break-all font-mono text-[11px] text-danger">
                now: {result.computedHash}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
