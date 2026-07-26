import type { SignerView, TemplateField } from '@docflow/contracts';

/**
 * What each of the 12 field types means to the SIGNER — which they must act on,
 * which auto-fill, which are optional inputs. Pure functions so the completion
 * rule is testable directly. Adapted from tms to DocFlow's snake_case types.
 */
const SIGNATURE_KINDS = new Set(['signature', 'initial', 'stamp']);
const AUTO_KINDS = new Set(['date', 'name', 'first_name', 'last_name', 'email']);

export type FieldKind = 'signature' | 'auto' | 'input';

export function fieldKind(field: TemplateField): FieldKind {
  if (SIGNATURE_KINDS.has(field.type)) return 'signature';
  if (AUTO_KINDS.has(field.type)) return 'auto';
  return 'input'; // company, title, text, checkbox
}

/** Stable per-field handle (fields always have an id in DocFlow). */
export function fieldKey(field: TemplateField, index: number): string {
  return field.id ?? `${field.type}-${field.page}-${index}`;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0]!, last: '' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

/** Values we can fill without asking. `signedOn` passed in for stable tests. */
export function autoValue(
  field: TemplateField,
  view: Pick<SignerView, 'recipientName' | 'signerEmail'>,
  signedOn: string,
): string {
  const full = view.recipientName?.trim() || '';
  switch (field.type) {
    case 'date':
      return signedOn;
    case 'email':
      return view.signerEmail;
    case 'name':
      return full || view.signerEmail;
    case 'first_name':
      return splitName(full).first;
    case 'last_name':
      return splitName(full).last;
    default:
      return '';
  }
}

/**
 * Which fields still block completion. Only fields marked `required` that are
 * signature-kind block — the sender placed them to get a signature. (DocFlow
 * fields DO carry `required`, unlike tms.)
 */
export function unsignedFields(
  fields: TemplateField[],
  filled: Record<string, string>,
): TemplateField[] {
  return fields.filter(
    (f, i) => fieldKind(f) === 'signature' && f.required && !filled[fieldKey(f, i)],
  );
}

export function canFinish(fields: TemplateField[], filled: Record<string, string>): boolean {
  return unsignedFields(fields, filled).length === 0;
}

export function signatureProgress(
  fields: TemplateField[],
  filled: Record<string, string>,
): { done: number; total: number } {
  const sig = fields.filter((f) => fieldKind(f) === 'signature');
  const done = sig.filter((f) => {
    const idx = fields.indexOf(f);
    return Boolean(filled[fieldKey(f, idx)]);
  }).length;
  return { done, total: sig.length };
}
