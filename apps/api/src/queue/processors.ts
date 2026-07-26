import { pino } from 'pino';
import { ResendSender } from '../email/resend.sender.js';
import { buildSigningInviteEmail } from '../email/signing-invite-email.js';
import type { EmailSender } from '../email/email.types.js';
import { completeSignature } from '../modules/signing/completion.js';
import {
  COMPLETE_JOB,
  INVITE_JOB,
  type CompleteSignatureJob,
  type SigningInviteJob,
} from './jobs.js';

const log = pino();

/**
 * Job-name → processor registry, consumed by the worker. Each processor is
 * self-contained (reads no tenant context) and idempotent — a retry after a
 * crash must not double-send or corrupt.
 */
export type Processor = (data: Record<string, unknown>) => Promise<void>;

// One shared sender for the worker process.
const email: EmailSender = new ResendSender();

export const processors: Record<string, Processor> = {
  probe: async () => {
    // Intentionally trivial — liveness/wiring check.
  },

  [INVITE_JOB]: async (data) => {
    const job = data as unknown as SigningInviteJob;
    // Sending is naturally idempotent enough here: BullMQ dedupes the enqueue
    // by jobId, and a retry re-sends the SAME invite (same link) — acceptable,
    // since the token is single-use, so at most one signing can result.
    await email.send(buildSigningInviteEmail(job));
  },

  // stamp → SHA-256 → Ed25519 seal → Certificate of Completion → store → email
  // both parties. Idempotent: re-running after a crash is a no-op once the
  // signed PDF exists (see completeSignature).
  [COMPLETE_JOB]: async (data) => {
    const job = data as unknown as CompleteSignatureJob;
    await completeSignature(job.tenant, job.requestId);
    log.info({ requestId: job.requestId }, 'signature completed (sealed + emailed)');
  },
};
