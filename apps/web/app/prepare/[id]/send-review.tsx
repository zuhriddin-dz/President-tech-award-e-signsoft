'use client';

import { useState } from 'react';
import { ArrowRight, CircleCheck, Mail } from 'lucide-react';
import type { RoutingMode } from '@docflow/contracts';
import { Avatar, Button } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlays';
import { recipientLabel, type EditorRecipient } from './recipients';

/**
 * The last screen before anything leaves the building. It restates exactly
 * what is about to happen — who gets an email, in what order, and what it
 * says — because sending is not undoable in the way a draft edit is.
 */
export function SendReview({
  documentName,
  recipients,
  routingMode,
  subject,
  message,
  fieldCount,
  onSend,
  onClose,
  onDone,
}: {
  documentName: string;
  recipients: EditorRecipient[];
  routingMode: RoutingMode;
  subject: string;
  message: string;
  fieldCount: number;
  onSend: () => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [state, setState] = useState<'review' | 'sending' | 'sent'>('review');
  const [error, setError] = useState<string | null>(null);

  const people = recipients.filter((r) => r.email.trim());
  const signers = people.filter((r) => r.role === 'signer');
  const sequential = routingMode === 'sequential' && signers.length > 1;

  async function submit() {
    setState('sending');
    setError(null);
    try {
      await onSend();
      setState('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.');
      setState('review');
    }
  }

  if (state === 'sent') {
    return (
      <Modal
        title="On its way"
        size="sm"
        onClose={onDone}
        footer={
          <Button variant="dark" onClick={onDone}>
            View agreements
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-4 px-7 py-10 text-center">
          <CircleCheck className="h-14 w-14 text-success" />
          <p className="text-xl font-semibold text-ink">{documentName} has been sent</p>
          <p className="text-sm text-ink-muted">
            {sequential
              ? `${recipientLabel(signers[0]!, 0)} has been emailed a secure link. Everyone after them is invited only once the person before has signed.`
              : `${signers.length} ${signers.length === 1 ? 'person has' : 'people have'} been emailed their own secure link.`}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Review and send"
      size="md"
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-sm text-danger">{error}</span>}
          <Button variant="ghost" onClick={onClose}>
            Keep editing
          </Button>
          <Button variant="dark" disabled={state === 'sending'} onClick={submit}>
            {state === 'sending' ? 'Sending…' : 'Send now'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6 px-7 py-6">
        <div>
          <p className="text-sm text-ink-muted">Document</p>
          <p className="text-lg font-semibold text-ink">{documentName}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {fieldCount} field{fieldCount === 1 ? '' : 's'} placed
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-bold tracking-wide text-ink uppercase">
            {sequential ? 'Signing order' : 'Recipients'}
          </p>
          <ol className="flex flex-col gap-2">
            {people.map((r, i) => (
              <li
                key={r.key}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                {sequential && (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-sunken text-xs font-bold text-ink">
                    {i + 1}
                  </span>
                )}
                <Avatar name={recipientLabel(r, i)} colorIndex={i} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{recipientLabel(r, i)}</p>
                  <p className="truncate text-sm text-ink-muted">{r.email}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-ink-muted">
                  {r.role === 'cc' ? 'Copy only' : 'Signs'}
                </span>
                {sequential && i < people.length - 1 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-lg border border-border bg-surface-muted p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Mail className="h-4 w-4" />
            They will receive
          </p>
          <p className="mt-2 font-medium text-ink">
            {subject.trim() || `Please sign: ${documentName}`}
          </p>
          {message.trim() && (
            <p className="mt-1.5 text-sm whitespace-pre-wrap text-ink-muted">{message.trim()}</p>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            Each link is single-use, tied to one person, and expires. No account is needed to sign.
          </p>
        </div>
      </div>
    </Modal>
  );
}
