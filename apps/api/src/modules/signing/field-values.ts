import type { TemplateField } from '@docflow/contracts';

/**
 * Deciding what text actually gets stamped into the sealed document.
 *
 * THE RULE: anything the certificate treats as a fact — who signed, when, at
 * what address — is computed HERE, on the server, from the request row. The
 * signer's browser computes the same values for display, but its version is
 * never trusted: a signer who edits the submit body could otherwise make the
 * contract's own face read "signed 01 Jan 2020 by Jane Doe", and the server
 * would hash, seal and certify exactly those bytes — with /verify reporting
 * "valid", because the forgery is inside the signed content.
 *
 * Only genuinely free-form inputs (text, checkbox, company, title) take the
 * signer's value, and only for fields that exist in the snapshot. Keys the
 * snapshot doesn't know are dropped rather than stored.
 */

/** Fields the adopted signature image is stamped into — never text. */
const IMAGE_KINDS = new Set(['signature', 'initial', 'stamp']);

/** SERVER-authoritative: derived from the request, never from the client. */
const AUTO_KINDS = new Set(['date', 'name', 'first_name', 'last_name', 'email']);

/** The signer genuinely authors these. */
const INPUT_KINDS = new Set(['text', 'checkbox', 'company', 'title']);

export interface SignerFacts {
  recipientName: string | null;
  recipientEmail: string;
  /** The authoritative signing moment (what the certificate records). */
  signedAt: Date;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0]!, last: '' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}

/** The server's own value for an auto field. */
function autoValue(type: string, facts: SignerFacts): string {
  const full = facts.recipientName?.trim() ?? '';
  switch (type) {
    case 'date':
      // ISO date — unambiguous, and it matches the certificate's timeline.
      return facts.signedAt.toISOString().slice(0, 10);
    case 'email':
      return facts.recipientEmail;
    case 'name':
      return full || facts.recipientEmail;
    case 'first_name':
      return splitName(full).first;
    case 'last_name':
      return splitName(full).last;
    default:
      return '';
  }
}

export interface ResolvedFieldValues {
  /** What to store and stamp — server truth for auto fields. */
  values: Record<string, string>;
  /** Required fields the signer left empty (server-side enforcement). */
  missingRequired: string[];
}

/**
 * Merge the signer's submission with server truth, keyed by the SNAPSHOT.
 * Client values survive only for input-kind fields that exist in the snapshot.
 */
export function resolveFieldValues(
  fields: TemplateField[],
  clientValues: Record<string, string>,
  facts: SignerFacts,
): ResolvedFieldValues {
  const values: Record<string, string> = {};
  const missingRequired: string[] = [];

  for (const field of fields) {
    if (IMAGE_KINDS.has(field.type)) continue; // the signature image, not text

    if (AUTO_KINDS.has(field.type)) {
      values[field.id] = autoValue(field.type, facts);
      continue;
    }

    if (!INPUT_KINDS.has(field.type)) continue; // unknown type: stamp nothing

    const supplied = clientValues[field.id];
    const value = typeof supplied === 'string' ? supplied.slice(0, 500) : '';
    if (value) values[field.id] = value;
    // A required input the signer left blank must not reach a sealed document.
    if (field.required && !value) missingRequired.push(field.id);
  }

  return { values, missingRequired };
}
