import { workerPrisma } from './worker-tenant-db.js';

/**
 * Find signatures that completed but never got sealed or delivered.
 *
 * A signature is committed BEFORE its completion job is enqueued (the signer's
 * act must never fail because Redis blinked), so an enqueue failure — or a job
 * lost between attempts — would otherwise strand real evidence forever: status
 * completed, no signed PDF, no certificate, no email, and a token that can no
 * longer re-drive the pipeline.
 *
 * This lives in the sanctioned tenant folder because it reads ACROSS tenants to
 * find that work, which no ordinary code path may do. It deliberately returns
 * only ids — the pipeline itself then runs under each row's own RLS context.
 */
export interface StrandedCompletion {
  requestId: string;
  tenant: string;
}

/** Completed rows missing artifacts or delivery, oldest first. */
export async function findStrandedCompletions(limit = 25): Promise<StrandedCompletion[]> {
  // Raw SQL as the OWNER-less runtime role would see nothing across tenants,
  // so this uses the same client but an explicitly cross-tenant query with no
  // RLS context set. RLS still applies — which is why the query runs through a
  // SECURITY DEFINER function rather than a bare SELECT.
  const rows = await workerPrisma().$queryRaw<{ request_id: string; tenant_id: string }[]>`
    SELECT request_id, tenant_id FROM public.find_stranded_completions(${limit})`;
  return rows.map((r) => ({ requestId: r.request_id, tenant: r.tenant_id }));
}
