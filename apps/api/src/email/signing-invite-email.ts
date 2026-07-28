import type { EmailMessage } from './email.types.js';
import { EMAIL_THEME, emailButton, emailFinePrint, emailParagraph, emailShell } from './theme.js';

export interface SigningInviteData {
  to: string;
  recipientName: string | null;
  documentName: string;
  senderName: string | null;
  /** The full signing URL, including the raw single-use token. */
  signUrl: string;
  /** The sender's own subject line, if they wrote one. */
  subject?: string | null;
  /** The sender's own note to the recipient, if they wrote one. */
  message?: string | null;
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
  // The sender's subject wins when they wrote one — recipients recognise their
  // counterparty's wording, not ours.
  const subject =
    data.subject?.trim() ||
    `${data.senderName ?? 'eSignSoft'} sent you "${data.documentName}" to sign`;

  // The note is escaped and rendered as a quoted block: it is the sender's
  // text, and it must never be able to inject markup into our email.
  const note = data.message?.trim()
    ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid ${EMAIL_THEME.brand};background:${EMAIL_THEME.surfaceMuted};font-size:14px;line-height:1.5;color:${EMAIL_THEME.inkMuted};white-space:pre-wrap">${esc(
        data.message.trim(),
      )}</blockquote>`
    : '';

  const html = emailShell(
    greeting,
    emailParagraph(`${from} has requested your signature on <strong>${doc}</strong>.`) +
      note +
      emailButton(data.signUrl, 'Review &amp; sign') +
      emailFinePrint(
        "This is a secure, single-use link that expires. If you weren't expecting this, you can ignore this email.",
      ),
  );

  const text = `${greeting}

${data.senderName ?? 'Someone'} has requested your signature on "${data.documentName}".
${data.message?.trim() ? `\n${data.message.trim()}\n` : ''}
Review & sign: ${data.signUrl}

This is a secure, single-use link that expires. If you weren't expecting this, you can ignore this email.`;

  return { to: data.to, subject, html, text };
}
