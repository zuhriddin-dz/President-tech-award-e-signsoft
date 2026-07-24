import { ForbiddenException, Injectable } from '@nestjs/common';
import type { VerifiedIdentity } from '../auth/claims.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext, type RequestAuth } from './tenant-context.js';

/**
 * Lazy sync: Clerk is the source of truth for identity and org membership;
 * our rows mirror it on each authenticated request (upserts are cheap and
 * idempotent). Webhook-driven sync can replace this later without changing
 * callers. Lives in src/tenant/ because it is the code that NAMES a tenant —
 * the ensure_tenant() SECURITY DEFINER function is the one sanctioned
 * bootstrap past RLS, and its inputs here come from a verified token only.
 */
@Injectable()
export class TenantSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContext,
  ) {}

  /** Verified identity → context entered for this request. Fail-closed: no org, no entry. */
  async establish(identity: VerifiedIdentity): Promise<RequestAuth> {
    if (!identity.clerkOrgId || !identity.role) {
      // Session has no active organization — tenant-scoped routes are closed.
      throw new ForbiddenException('No active organization');
    }

    // users is global (no RLS): upsert by the verified Clerk user id.
    const user = await this.prisma.user.upsert({
      where: { clerkUserId: identity.clerkUserId },
      create: {
        clerkUserId: identity.clerkUserId,
        email: identity.email ?? `${identity.clerkUserId}@placeholder.docflow.invalid`,
      },
      update: identity.email ? { email: identity.email } : {},
      select: { id: true },
    });

    const rows = await this.prisma.$queryRaw<{ ensure_tenant: string }[]>`
      SELECT public.ensure_tenant(${identity.clerkOrgId}, ${identity.orgName ?? ''})`;
    const tenantUuid = rows[0]?.ensure_tenant;
    if (!tenantUuid) throw new ForbiddenException();

    const auth: RequestAuth = {
      userId: user.id,
      clerkUserId: identity.clerkUserId,
      tenantId: tenantUuid,
      role: identity.role,
    };

    // Membership mirror runs inside the tenant's own RLS context.
    this.context.enter(auth);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantUuid}, true)`;
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: tenantUuid, userId: user.id } },
        create: { tenantId: tenantUuid, userId: user.id, role: auth.role },
        update: { role: auth.role },
      });
    });

    return auth;
  }
}
