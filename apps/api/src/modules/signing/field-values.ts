import { FIELD_VALUE_RULES, fieldValueProblem, type TemplateField } from '@docflow/contracts';

/**
 * Deciding what text actually gets stamped into the sealed document.
 *
 * THE RULE: the moment of signing is a fact the certificate records, so the
 * Date Signed box is computed HERE from the server clock and never taken from
 * the client. A signer who edits the submit body could otherwise make the
 * contract's own face read "signed 01 Jan 2020", and the server would hash,
 * seal and certify exactly those bytes — with /verify reporting "valid",
 * because the forgery is inside the signed content.
 *
 * Everything else is the signer's own input — name and email included. Those
 * two were server-filled until 2026-09; making the signer type them was a
 * product decision, taken knowing the trade: the face now shows what the
 * signer typed, which can differ from the invited name or address. WHO signed
 * is still proven where it always was — the certificate's invited address and
 * possession of its link.
 *
 * Every typed value must pass its FIELD_VALUE_RULES entry, the same rule the
 * signing app enforces as the signer types, so a value only fails here when
 * the browser was bypassed. Only fields the snapshot knows are kept, and a
 * choice field only ever holds an option the sender offered.
 */

/** Fields the adopted signature image is stamped into — never text. */
const IMAGE_KINDS = new Set(['signature', 'initial', 'stamp']);

/** SERVER-authoritative: Date Signed, from the signing moment. */
const AUTO_KINDS = new Set(['date']);

/** Choice fields: the value must be one the SENDER offered, or nothing. */
const CHOICE_KINDS = new Set(['dropdown', 'radio']);

export interface SignerFacts {
  /** The authoritative signing moment (what the certificate records). */
  signedAt: Date;
}

/** The server's own value for an auto field. */
function autoValue(type: string, facts: SignerFacts): string {
  // ISO date — unambiguous, and it matches the certificate's timeline.
  return type === 'date' ? facts.signedAt.toISOString().slice(0, 10) : '';
}

export interface ResolvedFieldValues {
  /** What to store and stamp — server truth for Date Signed. */
  values: Record<string, string>;
  /** Required fields the signer left empty (server-side enforcement). */
  missingRequired: string[];
  /** Fields whose value breaks their rule — only reachable by bypassing the signing app. */
  invalid: string[];
}

/**
 * Merge the signer's submission with server truth, keyed by the SNAPSHOT.
 * Client values survive only for input fields that exist in the snapshot, and
 * only when they pass their field's rule.
 */
export function resolveFieldValues(
  fields: TemplateField[],
  clientValues: Record<string, string>,
  facts: SignerFacts,
): ResolvedFieldValues {
  const values: Record<string, string> = {};
  const missingRequired: string[] = [];
  const invalid: string[] = [];

  for (const field of fields) {
    if (IMAGE_KINDS.has(field.type)) continue; // the signature image, not text

    if (AUTO_KINDS.has(field.type)) {
      values[field.id] = autoValue(field.type, facts);
      continue;
    }

    // The signer authors every type that has a rule. FIELD_VALUE_RULES is
    // exhaustive over FieldType, so no type exists without that decision.
    if (!FIELD_VALUE_RULES[field.type]) continue; // no rule: nothing typed is stamped

    const supplied = clientValues[field.id];
    const value = typeof supplied === 'string' ? supplied.trim() : '';

    if (!value) {
      // A required input the signer left blank must not reach a sealed document.
      if (field.required) missingRequired.push(field.id);
      continue;
    }

    // A choice field can only ever hold one of the options the SENDER offered.
    // Without this the signer could type any string into a "dropdown" and have
    // it stamped, hashed and sealed as if it were an offered answer.
    const offered = !CHOICE_KINDS.has(field.type) || (field.options ?? []).includes(value);
    if (!offered || fieldValueProblem(field.type, value) !== null) {
      invalid.push(field.id);
      continue;
    }

    values[field.id] = value;
  }

  return { values, missingRequired, invalid };
}
