/**
 * @docflow/db — the one shared-schema database.
 *
 * RLS contract (enforced by migrations, proven by rls.spec.ts):
 * every tenant table filters rows to `current_setting('app.tenant_id')`,
 * which callers set per TRANSACTION via `set_config('app.tenant_id', <id>, true)`
 * — is_local=true scopes it to the transaction, which is what makes the
 * pattern safe on a pooled connection. The RLS context setter that wraps this
 * for the API lives in apps/api/src/tenant/ (Phase 3), nowhere else.
 */
export { PrismaClient } from '@prisma/client';
export const PACKAGE_NAME = '@docflow/db' as const;
