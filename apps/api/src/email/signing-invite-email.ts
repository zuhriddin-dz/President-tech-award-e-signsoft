import type { EmailMessage } from './email.types.js';

export interface SigningInviteData {
  to: string;
  recipientName: string | null;
  documentName: string;
  senderName: string | null;
  /** The full signing URL, including the raw single-use token. */
  signUrl: string;
}

/** Escape user-controlled strings before they land in the HTML body. */
function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Build the signing-invite email — pure data in, message out (no DB, no I/O). */
export function buildSigningInviteEmail(data: SigningInviteData): EmailMessage {
  const greeting = data.recipientName ? `Hi ${esc(data.recipientName)},` : 'Hi,';
  const from = data.senderName ? esc(data.senderName) : 'Someone';
  const doc = esc(data.documentName);
  const subject = `${data.senderName ?? 'DocFlow'} sent you "${data.documentName}" to sign`;

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
    <h2 style="font-size:18px;margin:0 0 12px">${greeting}</h2>
    <p style="font-size:14px;line-height:1.5;color:#374151">
      ${from} has requested your signature on <strong>${doc}</strong>.
    </p>
    <p style="margin:24px 0">
      <a href="${data.signUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;display:inline-block">
        Review &amp; sign
      </a>
    </p>
    <p style="font-size:12px;color:#6b7280;line-height:1.5">
      This is a secure, single-use link that expires. If you weren't expecting this, you can ignore this email.
    </p>
  </div>`.trim();

  const text = `${greeting}

${data.senderName ?? 'Someone'} has requested your signature on "${data.documentName}".

Review & sign: ${data.signUrl}

This is a secure, single-use link that expires. If you weren't expecting this, you can ignore this email.`;

  return { to: data.to, subject, html, text };
}
