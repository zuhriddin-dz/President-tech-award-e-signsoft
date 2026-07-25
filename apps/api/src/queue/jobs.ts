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
}
