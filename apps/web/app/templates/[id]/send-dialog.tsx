'use client';
import { useState } from 'react';
import { Button, Card } from '@/components/ui/primitives';
import { sendSignatureRequest } from '@/lib/client';

/**
 * Send-for-signature dialog. Operator: the sender, who just tagged the fields;
 * their one job is to name the recipient. On success the request is queued and
 * the invite email goes out (via the worker).
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
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await sendSignatureRequest({
        templateId,
        recipientEmail: email.trim(),
        recipientName: name.trim() || undefined,
      });
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
      setState('idle');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
      <Card className="w-full max-w-md p-6">
        {state === 'sent' ? (
          <div className="text-center">
            <h2 className="text-lg font-semibold text-ink">Sent for signature</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {email} will get a secure signing link by email. Track it on your dashboard.
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
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-ink-muted">Recipient email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="signer@example.com"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-ink-muted">Recipient name (optional)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Rivera"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </label>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={state === 'sending' || !hasFields}>
                {state === 'sending' ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
