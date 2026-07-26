import { PrismaClient } from '@docflow/db';
import { env } from '../config/env.js';

/**
 * The WORKER's tenant-scoped database access.
 *
 * A background job has no HTTP request and no CLS store, so its tenant cannot
 * come from request context — it comes from the job payload, which is
 * SERVER-AUTHORED at enqueue time and never client input. This file lives in
 * apps/api/src/tenant/ because that is the one sanctioned place allowed to name
 * a tenant (security-lint RULE2 exempts it); everything it returns is already
 * RLS-scoped, exactly like the request-side TenantDb.
 */
let client: PrismaClient | null = null;

/** The worker's single Prisma client, on the runtime role (never the owner). */
export function workerPrisma(): PrismaClient {
  client ??= new PrismaClient({ datasources: { db: { url: env.APP_DATABASE_URL } } });
  return client;
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Run `fn` inside a transaction with the RLS context set to `tenantId` —
 * transaction-local (is_local=true), so it can never leak to the pooled
 * connection's next borrower.
 */
export async function runInTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return workerPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
