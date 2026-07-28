import type { EmailMessage } from './email.types.js';
import { emailButton, emailFinePrint, emailParagraph, emailShell } from './theme.js';

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

/** A polite nudge to someone who hasn't signed yet. */
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
    html: emailShell(
      'Still waiting for your signature',
      emailParagraph(
        `${greeting} <strong>${doc}</strong> has been waiting ${data.daysWaiting} day${
          data.daysWaiting === 1 ? '' : 's'
        } for you to sign.`,
      ) +
        emailButton(data.signUrl, 'Review &amp; sign') +
        emailFinePrint("If you've already signed, you can ignore this."),
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
    html: emailShell(
      'This document was cancelled',
      emailParagraph(
        `${greeting} the sender has cancelled <strong>${doc}</strong>, so it no longer needs your signature.${because}`,
      ) + emailFinePrint('Your signing link no longer works. No action is needed.'),
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
    html: emailShell(
      'This document expired unsigned',
      emailParagraph(
        `<strong>${doc}</strong> reached its expiry date without being fully signed. Still outstanding: ${who}.`,
      ) +
        emailParagraph(
          'The signing links no longer work. Send it again if you still need it signed.',
        ),
    ),
    text: `"${data.documentName}" expired without being fully signed. Still outstanding: ${data.unsigned.join(', ') || 'the recipients'}.\n\nThe signing links no longer work. Send it again if you still need it signed.`,
  };
}
