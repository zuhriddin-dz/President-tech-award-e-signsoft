import { workerPrisma } from './worker-tenant-db.js';

/**
 * Cross-tenant sweeps for the worker's lifecycle jobs — the same narrow,
 * read-only exception as findStrandedCompletions, and for the same reason: RLS
 * hides other tenants' rows from the runtime role, but a background sweep must
 * find work across all of them. Ids only; every write still happens under the
 * row's own tenant context.
 */
export interface ExpiredEnvelope {
  requestId: string;
  tenant: string;
}

export interface RemindableRecipient {
  recipientId: string;
  requestId: string;
  tenant: string;
}

export async function findExpiredEnvelopes(limit = 50): Promise<ExpiredEnvelope[]> {
  const rows = await workerPrisma().$queryRaw<{ request_id: string; tenant_id: string }[]>`
    SELECT request_id, tenant_id FROM public.find_expired_envelopes(${limit})`;
  return rows.map((r) => ({ requestId: r.request_id, tenant: r.tenant_id }));
}

export async function findRecipientsToRemind(
  afterDays: number,
  maxReminders: number,
  limit = 50,
): Promise<RemindableRecipient[]> {
  const rows = await workerPrisma().$queryRaw<
    { recipient_id: string; request_id: string; tenant_id: string }[]
  >`SELECT recipient_id, request_id, tenant_id
      FROM public.find_recipients_to_remind(${afterDays}, ${maxReminders}, ${limit})`;
  return rows.map((r) => ({
    recipientId: r.recipient_id,
    requestId: r.request_id,
    tenant: r.tenant_id,
  }));
}
