'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SignatureRequestDetail } from '@docflow/contracts';
import { Button } from '@/components/ui/primitives';
import { remindRecipient, resendRecipient, voidRequest } from '@/lib/client';

/**
 * The escape hatches for an envelope that isn't moving: nudge one person,
 * re-issue their link, or cancel the whole thing. Without these a stalled
 * document is a dead end — the sender can see it's stuck but do nothing.
 */
export function PacketActions({ detail }: { detail: SignatureRequestDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [reason, setReason] = useState('');

  const live = detail.status === 'sent' || detail.status === 'viewed';
  if (!live) return null;

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await action();
      setNote(done);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  const outstanding = detail.recipients.filter(
    (r) => r.role === 'signer' && r.status !== 'completed' && r.status !== 'pending',
  );

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-ink">Not moving?</h2>
      </div>
      <div className="space-y-3 px-5 py-4">
        {outstanding.length > 0 ? (
          <>
            <p className="text-sm text-ink-muted">
              Send a fresh link to someone who hasn&apos;t signed. Their previous link stops
              working.
            </p>
            <div className="flex flex-col gap-2">
              {outstanding.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 truncate text-sm text-ink">{r.email}</span>
                  <Button
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      run(`remind-${r.id}`, () => remindRecipient(detail.id, r.id), `Reminder sent to ${r.email}.`)
                    }
                  >
                    {busy === `remind-${r.id}` ? 'Sending…' : 'Remind'}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      run(`resend-${r.id}`, () => resendRecipient(detail.id, r.id), `New link sent to ${r.email}.`)
                    }
                  >
                    {busy === `resend-${r.id}` ? 'Sending…' : 'Resend link'}
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            Nobody is waiting on a link right now.
          </p>
        )}

        <div className="border-t border-border pt-3">
          {confirmVoid ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink">
                Cancel this packet? Everyone still outstanding is told, and their links stop
                working. This cannot be undone.
              </p>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional, shown to recipients)"
                maxLength={500}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setConfirmVoid(false)}>
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  disabled={busy !== null}
                  onClick={() =>
                    run('void', () => voidRequest(detail.id, reason.trim() || undefined), 'Document cancelled.')
                  }
                >
                  {busy === 'void' ? 'Cancelling…' : 'Cancel document'}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmVoid(true)}>
              Cancel document
            </Button>
          )}
        </div>

        {note && <p className="text-sm text-success">{note}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
