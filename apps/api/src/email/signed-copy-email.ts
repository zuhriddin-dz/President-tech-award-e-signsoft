import type { EmailMessage } from './email.types.js';

export interface SignedCopyData {
  documentName: string;
  recipientName: string | null;
  /** True for the sender's copy, false for the signer's. */
  isSender: boolean;
}

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * The completed-signature email — carries the signed PDF and the Certificate
 * of Completion as attachments. Both parties get the same evidence pair; only
 * the wording differs, so neither has to ask the other for a copy.
 */
export function buildSignedCopyEmail(data: SignedCopyData): Omit<EmailMessage, 'to'> {
  const doc = esc(data.documentName);
  const who = data.recipientName ? esc(data.recipientName) : 'The signer';

  const subject = data.isSender
    ? `Signed: "${data.documentName}"`
    : `Your signed copy of "${data.documentName}"`;

  const lead = data.isSender
    ? `${who} has signed <strong>${doc}</strong>.`
    : `Thanks for signing <strong>${doc}</strong>.`;

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
    <h2 style="font-size:18px;margin:0 0 12px">${data.isSender ? 'Document signed' : 'Your signed copy'}</h2>
    <p style="font-size:14px;line-height:1.5;color:#374151">${lead}</p>
    <p style="font-size:14px;line-height:1.5;color:#374151">
      Attached you'll find the signed document and its <strong>Certificate of Completion</strong>,
      which records who signed, when, and a cryptographic fingerprint proving the file
      has not been altered since.
    </p>
    <p style="font-size:12px;color:#6b7280;line-height:1.5">Keep both files for your records.</p>
  </div>`.trim();

  const text = `${data.isSender ? 'Document signed' : 'Your signed copy'}

${data.isSender ? `${data.recipientName ?? 'The signer'} has signed "${data.documentName}".` : `Thanks for signing "${data.documentName}".`}

Attached: the signed document and its Certificate of Completion, which records who signed, when, and a cryptographic fingerprint proving the file has not been altered since.

Keep both files for your records.`;

  return { subject, html, text };
}
