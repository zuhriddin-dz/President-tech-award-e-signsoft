'use client';
import { useState } from 'react';
import type { RecipientRole, RoutingMode } from '@docflow/contracts';
import { Button, Card } from '@/components/ui/primitives';
import { sendSignatureRequest } from '@/lib/client';

interface Row {
  email: string;
  name: string;
  role: RecipientRole;
}

/**
 * Send for signature. Operator: the sender, who just tagged the fields; their
 * job is naming who receives it and — when order matters — in what order.
 * One recipient is the common case, so the form starts there and grows.
 */
export function SendDialog({
  templateId,
  hasFields,
  onClose,
}: {
  templateId: string;
  hasFields: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([{ email: '', name: '', role: 'signer' }]);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('parallel');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await sendSignatureRequest({
        templateId,
        routingMode,
        recipients: rows.map((r, i) => ({
          email: r.email.trim(),
          name: r.name.trim() || undefined,
          role: r.role,
          // In sequential mode each row is its own step, in the listed order.
          routingOrder: routingMode === 'sequential' ? i + 1 : 1,
          // Everyone fills the same field group until per-recipient tagging
          // lands; the fields the sender placed carry recipientKey 'signer'.
          recipientKey: 'signer',
        })),
      });
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
      setState('idle');
    }
  }

  const signers = rows.filter((r) => r.role === 'signer').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/30 p-4">
      <Card className="my-8 w-full max-w-lg p-6">
        {state === 'sent' ? (
          <div className="text-center">
            <h2 className="text-lg font-semibold text-ink">Sent for signature</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {routingMode === 'sequential'
                ? 'The first signer has been emailed a secure link; each person is invited when the one before them finishes.'
                : `${signers} ${signers === 1 ? 'signer has' : 'signers have'} been emailed a secure link.`}
            </p>
            <Button className="mt-5" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 className="text-lg font-semibold text-ink">Send for signature</h2>
            {!hasFields && (
              <p className="mt-2 text-sm text-warning">
                Place at least one field before sending, then Save.
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3">
              {rows.map((row, i) => (
                <div key={i} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">
                      {routingMode === 'sequential' ? `Step ${i + 1}` : `Recipient ${i + 1}`}
                    </span>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-xs text-ink-muted hover:text-danger"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      required
                      value={row.email}
                      onChange={(e) => update(i, { email: e.target.value })}
                      placeholder="signer@example.com"
                      className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                    />
                    <input
                      value={row.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                      placeholder="Name (optional)"
                      className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                    />
                    <select
                      value={row.role}
                      onChange={(e) => update(i, { role: e.target.value as RecipientRole })}
                      className="rounded-md border border-border bg-surface px-2 py-2 text-sm text-ink"
                    >
                      <option value="signer">Signs</option>
                      <option value="cc">Receives a copy</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, { email: '', name: '', role: 'signer' }])}
              className="mt-2 text-sm font-medium text-brand hover:underline"
            >
              + Add recipient
            </button>

            {rows.length > 1 && (
              <div className="mt-4">
                <p className="text-sm text-ink-muted">Signing order</p>
                <div className="mt-1 flex gap-2">
                  {(
                    [
                      ['parallel', 'Everyone at once'],
                      ['sequential', 'One after another'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRoutingMode(mode)}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        routingMode === mode
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border text-ink-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={state === 'sending' || !hasFields || signers === 0}>
                {state === 'sending' ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
