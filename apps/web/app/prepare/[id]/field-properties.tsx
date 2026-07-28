'use client';

import { Plus, Trash2, X } from 'lucide-react';
import { Avatar, Button } from '@/components/ui/primitives';
import { FIELD_META, isChoice } from '@/lib/field-catalog';
import { indexOfKey, recipientLabel, type EditorRecipient } from './recipients';
import type { EditorField } from './editor';

/**
 * Properties for the selected field. Which controls appear depends on the
 * field's FAMILY, because that is what determines who supplies its value:
 * an auto field is filled by the server from the verified recipient, so
 * "required" and free-text options would be meaningless on it.
 */
export function FieldProperties({
  field,
  recipients,
  onChange,
  onDelete,
  onClose,
}: {
  field: EditorField;
  recipients: EditorRecipient[];
  onChange: (patch: Partial<EditorField>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const meta = FIELD_META[field.type];
  const options = field.options ?? [];

  function setOption(i: number, value: string) {
    onChange({ options: options.map((o, idx) => (idx === i ? value : o)) });
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Field</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close properties"
          className="rounded-md p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
        <span className="text-brand">{meta.icon}</span>
        <span className="font-semibold text-ink">{meta.label}</span>
        <span className="ml-auto text-xs text-ink-muted">Page {field.page}</span>
      </div>

      <label className="mt-5 block">
        <span className="text-sm font-medium text-ink">Assigned to</span>
        <select
          value={field.recipientKey}
          onChange={(e) => onChange({ recipientKey: e.target.value })}
          className="mt-1.5 h-11 w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-ink"
        >
          {recipients.map((r, i) => (
            <option key={r.key} value={r.key}>
              {recipientLabel(r, i)}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
        <Avatar
          name={recipientLabel(
            recipients.find((r) => r.key === field.recipientKey) ?? recipients[0]!,
            0,
          )}
          colorIndex={Math.max(0, indexOfKey(field.recipientKey))}
          size={18}
        />
        Only this person sees and fills this box.
      </div>

      {meta.family === 'auto' ? (
        <p className="mt-5 rounded-lg border border-border bg-surface-muted p-3 text-sm text-ink-muted">
          E-SIGNSOFT fills this in from the recipient we verified — the signer cannot type over it.
          That is what makes the value on the finished document trustworthy.
        </p>
      ) : meta.family === 'mark' ? (
        <p className="mt-5 rounded-lg border border-border bg-surface-muted p-3 text-sm text-ink-muted">
          The signer&apos;s adopted signature is placed here, scaled to fit without distorting it.
        </p>
      ) : (
        <label className="mt-5 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="h-4 w-4 accent-brand"
          />
          <span className="text-sm text-ink">Required — they cannot finish without it</span>
        </label>
      )}

      {isChoice(field.type) && (
        <div className="mt-5">
          <p className="text-sm font-medium text-ink">Options</p>
          <p className="mt-1 text-xs text-ink-muted">
            The server refuses any answer that is not on this list, so these are the only values
            that can ever reach the signed document.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  maxLength={120}
                  onChange={(e) => setOption(i, e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-md border border-border-strong px-2 text-sm outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => onChange({ options: options.filter((_, idx) => idx !== i) })}
                  disabled={options.length <= 1}
                  aria-label={`Remove option ${i + 1}`}
                  className="rounded-md p-2 text-ink-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange({ options: [...options, `Option ${options.length + 1}`] })}
            disabled={options.length >= 30}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-link hover:underline disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Add option
          </button>
        </div>
      )}

      <div className="mt-6 border-t border-border pt-4">
        <p className="text-xs text-ink-muted">
          Position {Math.round(field.x * 100)}%, {Math.round(field.y * 100)}% · size{' '}
          {Math.round(field.w * 100)}% × {Math.round(field.h * 100)}%
        </p>
        <Button variant="danger" className="mt-3 w-full" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          Delete field
        </Button>
      </div>
    </div>
  );
}
