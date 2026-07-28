import type { RecipientRole, TemplateField } from '@docflow/contracts';

/**
 * Recipient roles inside the prepare flow.
 *
 * A template stores fields tagged with a `recipientKey`, not with a person —
 * that is what makes it reusable. The keys are positional (`signer`,
 * `signer-2`, …) so opening a saved template reconstructs exactly as many
 * roles as it has tagged field groups, and re-sending it to different people
 * lands their fields in the right boxes.
 */
export interface EditorRecipient {
  /** Stable across saves; matches TemplateField.recipientKey. */
  key: string;
  name: string;
  email: string;
  role: RecipientRole;
}

/** The key for the nth role (0-based). Index 0 keeps the legacy 'signer'. */
export function recipientKeyAt(index: number): string {
  return index === 0 ? 'signer' : `signer-${index + 1}`;
}

/** Position of a key in the role order, or -1 if it isn't one of ours. */
export function indexOfKey(key: string): number {
  if (key === 'signer') return 0;
  const m = /^signer-(\d+)$/.exec(key);
  if (!m) return -1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 2 ? n - 1 : -1;
}

/**
 * How many roles a saved template implies: enough to cover every tagged group
 * it already contains, and never fewer than one.
 */
export function rolesInFields(fields: Pick<TemplateField, 'recipientKey'>[]): number {
  const highest = fields.reduce((max, f) => Math.max(max, indexOfKey(f.recipientKey)), 0);
  return highest + 1;
}

export function blankRecipient(index: number): EditorRecipient {
  return { key: recipientKeyAt(index), name: '', email: '', role: 'signer' };
}

/** A recipient is ready to send to once it has a plausible address. */
export function isComplete(r: EditorRecipient): boolean {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(r.email.trim());
}

/** What to call this person before they've been named. */
export function recipientLabel(r: EditorRecipient, index: number): string {
  return r.name.trim() || r.email.trim() || `Recipient ${index + 1}`;
}
