import type { EmailMessage } from './email.types.js';

/**
 * The emails an envelope sends when it does NOT simply get signed: a nudge, a
 * cancellation, an expiry. Each exists so a stalled document has a voice —
 * silence is the failure mode these prevent.
 */

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function wrap(title: string, bodyHtml: string): string {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
    <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
    ${bodyHtml}
  </div>`.trim();
}

/** A polite nudge to someone who hasn't signed yet. Same link as the invite. */
export function buildReminderEmail(data: {
  to: string;
  recipientName: string | null;
  documentName: string;
  signUrl: string;
  daysWaiting: number;
}): EmailMessage {
  const greeting = data.recipientName ? `Hi ${esc(data.recipientName)},` : 'Hi,';
  const doc = esc(data.documentName);
  return {
    to: data.to,
    subject: `Reminder: "${data.documentName}" is waiting for your signature`,
    html: wrap(
      'Still waiting for your signature',
      `<p style="font-size:14px;line-height:1.5;color:#374151">${greeting} <strong>${doc}</strong> has been waiting
       ${data.daysWaiting} day${data.daysWaiting === 1 ? '' : 's'} for you to sign.</p>
       <p style="margin:24px 0"><a href="${data.signUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;display:inline-block">Review &amp; sign</a></p>
       <p style="font-size:12px;color:#6b7280">If you've already signed, you can ignore this.</p>`,
    ),
    text: `${greeting}\n\n"${data.documentName}" has been waiting ${data.daysWaiting} day(s) for your signature.\n\nReview & sign: ${data.signUrl}\n\nIf you've already signed, ignore this.`,
  };
}

/** Told to everyone still outstanding when the sender cancels. */
export function buildVoidedEmail(data: {
  to: string;
  recipientName: string | null;
  documentName: string;
  reason: string | null;
}): EmailMessage {
  const greeting = data.recipientName ? `Hi ${esc(data.recipientName)},` : 'Hi,';
  const doc = esc(data.documentName);
  const because = data.reason ? ` Reason given: ${esc(data.reason)}.` : '';
  return {
    to: data.to,
    subject: `Cancelled: "${data.documentName}" no longer needs your signature`,
    html: wrap(
      'This document was cancelled',
      `<p style="font-size:14px;line-height:1.5;color:#374151">${greeting} the sender has cancelled
       <strong>${doc}</strong>, so it no longer needs your signature.${because}</p>
       <p style="font-size:12px;color:#6b7280">Your signing link no longer works. No action is needed.</p>`,
    ),
    text: `${greeting}\n\nThe sender cancelled "${data.documentName}", so it no longer needs your signature.${data.reason ? ` Reason: ${data.reason}.` : ''}\n\nYour signing link no longer works. No action is needed.`,
  };
}

/** Told to the SENDER when an envelope lapses unsigned. */
export function buildExpiredEmail(data: {
  to: string;
  documentName: string;
  unsigned: string[];
}): EmailMessage {
  const doc = esc(data.documentName);
  const who = data.unsigned.map(esc).join(', ') || 'the recipients';
  return {
    to: data.to,
    subject: `Expired: "${data.documentName}" was not signed in time`,
    html: wrap(
      'This document expired unsigned',
      `<p style="font-size:14px;line-height:1.5;color:#374151"><strong>${doc}</strong> reached its expiry date without
       being fully signed. Still outstanding: ${who}.</p>
       <p style="font-size:14px;line-height:1.5;color:#374151">The signing links no longer work. Send it again if you
       still need it signed.</p>`,
    ),
    text: `"${data.documentName}" expired without being fully signed. Still outstanding: ${data.unsigned.join(', ') || 'the recipients'}.\n\nThe signing links no longer work. Send it again if you still need it signed.`,
  };
}
