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

/**
 * The ::int casts are load-bearing, not decoration.
 *
 * Prisma sends a JS number as int8, and Postgres does NOT implicitly downcast
 * int8 to int4 when resolving a function — so `find_expired_envelopes(50)`
 * against a function declared `(max_rows int)` fails with 42883, "function
 * does not exist", which reads like a missing migration rather than a type
 * mismatch. Casting at the call site pins the argument to the declared type.
 */
export async function findExpiredEnvelopes(limit = 50): Promise<ExpiredEnvelope[]> {
  const rows = await workerPrisma().$queryRaw<{ request_id: string; tenant_id: string }[]>`
    SELECT request_id, tenant_id FROM public.find_expired_envelopes(${limit}::int)`;
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
      FROM public.find_recipients_to_remind(${afterDays}::int, ${maxReminders}::int, ${limit}::int)`;
  return rows.map((r) => ({
    recipientId: r.recipient_id,
    requestId: r.request_id,
    tenant: r.tenant_id,
  }));
}
