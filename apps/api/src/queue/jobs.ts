/**
 * Job names + payload shapes, shared by the producer (API) and the consumer
 * (worker) so the two never drift. Payloads must be self-contained JSON — the
 * worker reads no tenant context.
 */
export const INVITE_JOB = 'send-signing-invite';

export interface SigningInviteJob {
  to: string;
  recipientName: string | null;
  documentName: string;
  senderName: string | null;
  /** Full signing URL including the raw single-use token. */
  signUrl: string;
  /** The sender's own subject line and note, if they wrote them. */
  subject?: string | null;
  message?: string | null;
}

// The completion pipeline (Phase 10): stamp → hash → seal → certificate →
// email. Carries only the request id; the worker loads everything under RLS.
export const COMPLETE_JOB = 'complete-signature';

export interface CompleteSignatureJob {
  requestId: string;
  /**
   * The tenant to run under. SERVER-AUTHORED at enqueue time from the verified
   * request row — never client input — because a worker has no request context
   * to derive it from. Consumed only by apps/api/src/tenant/worker-tenant-db.
   */
  tenant: string;
}

/**
 * A ready-made email to deliver. Used by the lifecycle actions (reminder,
 * void, expiry) where the body is composed at the call site — so sending stays
 * off the request path without inventing a job type per message.
 */
export const EMAIL_JOB = 'send-email';

export interface SendEmailJob {
  to: string;
  subject: string;
  html: string;
  text: string;
}
