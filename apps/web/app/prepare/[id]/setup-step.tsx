'use client';

import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { RecipientRole, RoutingMode } from '@docflow/contracts';
import { Avatar, Button } from '@/components/ui/primitives';
import { blankRecipient, isComplete, type EditorRecipient } from './recipients';

/**
 * Step one: who receives this, in what order, and what the email says.
 * Recipients come BEFORE fields because every field belongs to one of them —
 * tagging first and assigning later is how people end up with a signature box
 * addressed to the wrong party.
 */
export function SetupStep({
  recipients,
  routingMode,
  subject,
  message,
  documentName,
  fieldCountFor,
  onChange,
  onRoutingMode,
  onSubject,
  onMessage,
  onNext,
}: {
  recipients: EditorRecipient[];
  routingMode: RoutingMode;
  subject: string;
  message: string;
  documentName: string;
  fieldCountFor: (key: string) => number;
  onChange: (next: EditorRecipient[]) => void;
  onRoutingMode: (mode: RoutingMode) => void;
  onSubject: (v: string) => void;
  onMessage: (v: string) => void;
  onNext: () => void;
}) {
  const update = (i: number, patch: Partial<EditorRecipient>) =>
    onChange(recipients.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  function remove(i: number) {
    // Keys are positional, so removing a role would silently re-point every
    // later role's fields at the wrong person. Refuse while it has fields.
    if (fieldCountFor(recipients[i]!.key) > 0) return;
    onChange(recipients.filter((_, idx) => idx !== i));
  }

  const ready = recipients.some((r) => r.role === 'signer' && isComplete(r));

  return (
    <div className="thin-scroll h-full overflow-y-auto bg-surface-muted">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-ink">Add recipients</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Everyone listed here gets their own private link to <strong>{documentName}</strong>. In
          the next step you place each person&apos;s fields on the document.
        </p>

        <div className="mt-7 flex flex-col gap-3">
          {recipients.map((r, i) => {
            const count = fieldCountFor(r.key);
            return (
              <div
                key={r.key}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-5 w-5 shrink-0 text-ink-faint" />
                  <Avatar name={r.name || r.email || `R ${i + 1}`} colorIndex={i} size={36} />
                </div>

                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Name"
                    maxLength={200}
                    className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand"
                  />
                  <input
                    type="email"
                    value={r.email}
                    onChange={(e) => update(i, { email: e.target.value })}
                    placeholder="name@company.com"
                    className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand"
                  />
                </div>

                <select
                  value={r.role}
                  onChange={(e) => update(i, { role: e.target.value as RecipientRole })}
                  className="h-11 rounded-md border border-border-strong bg-surface px-2 text-sm text-ink"
                  aria-label={`Role for recipient ${i + 1}`}
                >
                  <option value="signer">Needs to sign</option>
                  <option value="cc">Receives a copy</option>
                </select>

                <div className="flex items-center gap-2">
                  {count > 0 && (
                    <span className="text-xs whitespace-nowrap text-ink-muted">
                      {count} field{count === 1 ? '' : 's'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={recipients.length === 1 || count > 0}
                    title={
                      count > 0
                        ? 'Delete this recipient’s fields first'
                        : recipients.length === 1
                          ? 'A document needs at least one recipient'
                          : 'Remove recipient'
                    }
                    aria-label={`Remove recipient ${i + 1}`}
                    className="rounded-md p-2 text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:pointer-events-none disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onChange([...recipients, blankRecipient(recipients.length)])}
          disabled={recipients.length >= 6}
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-link hover:underline disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          Add recipient
        </button>

        {recipients.filter((r) => r.role === 'signer').length > 1 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold tracking-wide text-ink uppercase">Signing order</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {(
                [
                  ['parallel', 'Everyone at once', 'All signers get their link immediately.'],
                  [
                    'sequential',
                    'One after another',
                    'Each person is invited only once the person above them has signed.',
                  ],
                ] as const
              ).map(([mode, label, help]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onRoutingMode(mode)}
                  aria-pressed={routingMode === mode}
                  className={`max-w-xs flex-1 rounded-lg border p-4 text-left transition-colors ${
                    routingMode === mode
                      ? 'border-brand bg-brand-soft'
                      : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  <p className="font-semibold text-ink">{label}</p>
                  <p className="mt-1 text-sm text-ink-muted">{help}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-sm font-bold tracking-wide text-ink uppercase">Message</h2>
          <div className="mt-3 flex flex-col gap-3">
            <input
              value={subject}
              onChange={(e) => onSubject(e.target.value)}
              maxLength={200}
              placeholder={`Please sign: ${documentName}`}
              className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm outline-none focus:border-brand"
              aria-label="Email subject"
            />
            <textarea
              value={message}
              onChange={(e) => onMessage(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Add a note for your recipients (optional)"
              className="rounded-md border border-border-strong bg-surface p-3 text-sm outline-none focus:border-brand"
              aria-label="Email message"
            />
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Button variant="dark" size="lg" disabled={!ready} onClick={onNext}>
            Next: add fields
          </Button>
          {!ready && (
            <span className="text-sm text-ink-muted">
              Add at least one signer with a valid email address.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
