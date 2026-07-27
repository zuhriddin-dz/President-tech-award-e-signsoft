import { mintSigningToken } from '@docflow/crypto';
import { env } from '../../config/env.js';
import { ResendSender } from '../../email/resend.sender.js';
import { buildExpiredEmail, buildReminderEmail } from '../../email/lifecycle-emails.js';
import type { EmailSender } from '../../email/email.types.js';
import { runInTenant } from '../../tenant/worker-tenant-db.js';
import {
  findExpiredEnvelopes,
  findRecipientsToRemind,
} from '../../tenant/lifecycle-sweeps.js';

/**
 * The envelope's unhappy paths, run by the worker.
 *
 * Without these an unsigned document is a dead end: the link quietly stops
 * working, nobody is told, and the sender has no idea. Reminders nudge, expiry
 * closes the loop and says so.
 */
const email: EmailSender = new ResendSender();

/** Retire envelopes past their expiry, and tell the sender once. */
export async function sweepExpiredEnvelopes(): Promise<number> {
  const expired = await findExpiredEnvelopes();
  for (const e of expired) {
    const info = await runInTenant(e.tenant, async (tx) => {
      const row = await tx.signatureRequest.findUnique({
        where: { id: e.requestId },
        include: { recipients: true },
      });
      if (!row) return null;
      // Kill the links as we retire it: a token whose hash is gone resolves to
      // nothing, so an expired envelope cannot be signed by a stale tab.
      await tx.signatureRequest.updateMany({
        where: { id: e.requestId, status: { in: ['sent', 'viewed'] } },
        data: { status: 'expired' },
      });
      await tx.recipient.updateMany({
        where: { requestId: e.requestId, status: { in: ['pending', 'sent', 'viewed'] } },
        data: { signingTokenHash: null },
      });
      const alreadyTold = row.expiredNotifiedAt !== null;
      if (!alreadyTold) {
        await tx.signatureRequest.updateMany({
          where: { id: e.requestId, expiredNotifiedAt: null },
          data: { expiredNotifiedAt: new Date() },
        });
      }
      return {
        alreadyTold,
        senderEmail: row.senderEmail,
        documentName: row.documentName,
        unsigned: row.recipients
          .filter((r) => r.role === 'signer' && r.status !== 'completed')
          .map((r) => r.email),
      };
    });

    // Notify after the state change, and only once — a mail failure must not
    // leave the envelope un-retired, and a retry must not re-notify.
    if (info && !info.alreadyTold && info.senderEmail) {
      await email.send(
        buildExpiredEmail({
          to: info.senderEmail,
          documentName: info.documentName,
          unsigned: info.unsigned,
        }),
      );
    }
  }
  return expired.length;
}

/**
 * Nudge signers who've been sitting on a live link.
 *
 * We only hold the token HASH, so a reminder cannot repeat the original URL —
 * it carries a freshly minted one, and the previous link stops working. That
 * is a feature: the newest email is always the one that works.
 */
export async function sweepReminders(): Promise<number> {
  const due = await findRecipientsToRemind(env.REMINDER_AFTER_DAYS, env.REMINDER_MAX);
  for (const d of due) {
    const info = await runInTenant(d.tenant, async (tx) => {
      const rc = await tx.recipient.findUnique({ where: { id: d.recipientId } });
      const row = await tx.signatureRequest.findUnique({ where: { id: d.requestId } });
      if (!rc || !row || rc.status === 'completed') return null;

      const minted = mintSigningToken();
      // reminderCount in the WHERE makes the bump the claim: two sweeps racing
      // the same recipient can't both send.
      const { count } = await tx.recipient.updateMany({
        where: { id: rc.id, reminderCount: rc.reminderCount },
        data: {
          signingTokenHash: minted.sha256,
          lastRemindedAt: new Date(),
          reminderCount: rc.reminderCount + 1,
        },
      });
      if (count !== 1) return null;
      const since = rc.lastRemindedAt ?? rc.sentAt ?? row.sentAt;
      return {
        token: minted.token,
        email: rc.email,
        name: rc.name,
        documentName: row.documentName,
        daysWaiting: Math.max(1, Math.round((Date.now() - since.getTime()) / 86_400_000)),
      };
    });

    if (info) {
      await email.send(
        buildReminderEmail({
          to: info.email,
          recipientName: info.name,
          documentName: info.documentName,
          signUrl: `${env.SIGN_APP_URL}/sign/${info.token}`,
          daysWaiting: info.daysWaiting,
        }),
      );
    }
  }
  return due.length;
}
