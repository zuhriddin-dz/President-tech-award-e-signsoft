import { FIELD_VALUE_RULES, fieldValueProblem, type TemplateField } from '@docflow/contracts';

/**
 * What each field type means to the SIGNER — which they must act on, which the
 * system fills, which they type. Pure functions so the completion rule is
 * testable directly.
 */
const SIGNATURE_KINDS = new Set(['signature', 'initial', 'stamp']);
/** Only Date Signed: the SERVER stamps the moment of signing; nobody types it. */
const AUTO_KINDS = new Set(['date']);

export type FieldKind = 'signature' | 'auto' | 'input';

export function fieldKind(field: TemplateField): FieldKind {
  if (SIGNATURE_KINDS.has(field.type)) return 'signature';
  if (AUTO_KINDS.has(field.type)) return 'auto';
  // Everything else is typed by the signer — names and email included.
  return 'input';
}

/** Human label for a field, used on chips and in the navigation list. */
export function fieldLabel(field: TemplateField): string {
  const named: Partial<Record<TemplateField['type'], string>> = {
    signature: 'Signature',
    initial: 'Initial',
    stamp: 'Stamp',
    date: 'Date Signed',
    name: 'Name',
    first_name: 'First Name',
    last_name: 'Last Name',
    email: 'Email',
    company: 'Company',
    title: 'Title',
    text: 'Text',
    number: 'Number',
    phone: 'Phone',
    address: 'Address',
    checkbox: 'Checkbox',
    dropdown: 'Dropdown',
    radio: 'Choice',
    date_input: 'Date',
  };
  return field.label?.trim() || named[field.type] || 'Field';
}

/** Stable per-field handle (fields always have an id in E-SIGNSOFT). */
export function fieldKey(field: TemplateField, index: number): string {
  return field.id ?? `${field.type}-${field.page}-${index}`;
}

/**
 * Date Signed as shown while signing. The server stamps its own clock, never
 * this string. `signedOn` is passed in for stable tests.
 */
export function autoValue(field: TemplateField, signedOn: string): string {
  return field.type === 'date' ? signedOn : '';
}

/**
 * Why this box's value cannot be submitted, in words the signer can act on —
 * or null. The SAME rules the API applies on submit (FIELD_VALUE_RULES in
 * @docflow/contracts), plus the sender's option list for choices. If the two
 * sides disagreed, the API would refuse a form that looks fine here — and on
 * the signing surface every refusal is the same "link not valid" page, so the
 * signer would lose the ceremony with no idea why.
 */
export function fieldProblem(field: TemplateField, value: string): string | null {
  if (fieldKind(field) !== 'input') return null;
  const v = value.trim();
  if (!v) return null;
  if ((field.type === 'dropdown' || field.type === 'radio') && !(field.options ?? []).includes(v)) {
    return FIELD_VALUE_RULES[field.type]?.hint ?? 'Choose one of the offered options';
  }
  return fieldValueProblem(field.type, v);
}

/**
 * Required boxes the signer hasn't filled — signature boxes and inputs alike.
 * Blank means blank after trimming, as it does on the server: a box holding
 * only spaces would otherwise look done here and be refused there.
 * Date Signed is excluded: the SERVER supplies it, so the signer can never be
 * the reason it is missing.
 */
export function unsignedFields(
  fields: TemplateField[],
  filled: Record<string, string>,
): TemplateField[] {
  return fields.filter((f, i) => {
    if (!f.required) return false;
    if (fieldKind(f) === 'auto') return false;
    return !filled[fieldKey(f, i)]?.trim();
  });
}

/** Boxes holding a value their field's rule refuses. */
export function invalidFields(
  fields: TemplateField[],
  filled: Record<string, string>,
): TemplateField[] {
  return fields.filter((f, i) => fieldProblem(f, filled[fieldKey(f, i)] ?? '') !== null);
}

/** Everything standing between the signer and Finish, in document order. */
export function blockingFields(
  fields: TemplateField[],
  filled: Record<string, string>,
): TemplateField[] {
  const unsigned = new Set(unsignedFields(fields, filled));
  const invalid = new Set(invalidFields(fields, filled));
  return fields.filter((f) => unsigned.has(f) || invalid.has(f));
}

export function canFinish(fields: TemplateField[], filled: Record<string, string>): boolean {
  return blockingFields(fields, filled).length === 0;
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
