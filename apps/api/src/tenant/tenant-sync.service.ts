import { ForbiddenException, Injectable } from '@nestjs/common';
import type { MembershipRole } from '@docflow/db';
import type { VerifiedIdentity } from '../auth/claims.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OnboardingRequiredException } from './onboarding-required.exception.js';
import { TenantContext, type RequestAuth } from './tenant-context.js';

/**
 * Lazy sync: Clerk is the source of truth for identity and org membership; our
 * rows mirror it on each authenticated request (upserts are cheap and
 * idempotent). Lives in src/tenant/ because it is the code that NAMES a tenant
 * — the ensure_tenant / ensure_personal_tenant SECURITY DEFINER functions are
 * the only sanctioned bootstrap past RLS, and their inputs come from a verified
 * token only.
 *
 * Two workspace kinds, one isolation model:
 * - COMPANY: keyed by the active Clerk org; role comes from the org membership.
 * - PERSONAL: keyed by the Clerk user; the user is always OWNER. Created only by
 *   an explicit onboarding choice (establishPersonal), never auto-provisioned —
 *   so a brand-new user with no org gets the choice screen, not a silent tenant.
 */
@Injectable()
export class TenantSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContext,
  ) {}

  /** Verified identity → tenant context for this request (the guard's role path). */
  async establish(identity: VerifiedIdentity): Promise<RequestAuth> {
    if (identity.clerkOrgId && identity.role) {
      const tenantUuid = await this.ensureCompanyTenant(identity);
      return this.enterWithMembership(identity, tenantUuid, identity.role);
    }

    // No active org: use the personal tenant if it already exists, else the
    // user must onboard (pick personal or company) first. The lookup is a
    // SECURITY DEFINER function because RLS context does not exist yet — a
    // plain query as docflow_app would (correctly) see nothing.
    const user = await this.upsertUser(identity);
    const rows = await this.prisma.$queryRaw<{ find_personal_tenant: string | null }[]>`
      SELECT public.find_personal_tenant(${identity.clerkUserId})`;
    const tenantUuid = rows[0]?.find_personal_tenant;
    if (!tenantUuid) throw new OnboardingRequiredException();
    return this.enterWithMembership(identity, tenantUuid, 'OWNER', user.id);
  }

  /** Explicit onboarding: create (or reuse) this user's personal workspace. */
  async establishPersonal(identity: VerifiedIdentity): Promise<RequestAuth> {
    const rows = await this.prisma.$queryRaw<{ ensure_personal_tenant: string }[]>`
      SELECT public.ensure_personal_tenant(${identity.clerkUserId}, ${personalName(identity)})`;
    const tenantUuid = rows[0]?.ensure_personal_tenant;
    if (!tenantUuid) throw new ForbiddenException();
    return this.enterWithMembership(identity, tenantUuid, 'OWNER');
  }

  private async ensureCompanyTenant(identity: VerifiedIdentity): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ ensure_tenant: string }[]>`
      SELECT public.ensure_tenant(${identity.clerkOrgId}, ${identity.orgName ?? ''})`;
    const tenantUuid = rows[0]?.ensure_tenant;
    if (!tenantUuid) throw new ForbiddenException();
    return tenantUuid;
  }

  private async upsertUser(identity: VerifiedIdentity): Promise<{ id: string }> {
    // users is global (no RLS): upsert by the verified Clerk user id.
    return this.prisma.user.upsert({
      where: { clerkUserId: identity.clerkUserId },
      create: {
        clerkUserId: identity.clerkUserId,
        email: identity.email ?? `${identity.clerkUserId}@placeholder.docflow.invalid`,
      },
      update: identity.email ? { email: identity.email } : {},
      select: { id: true },
    });
  }

  private async enterWithMembership(
    identity: VerifiedIdentity,
    tenantUuid: string,
    role: MembershipRole,
    knownUserId?: string,
  ): Promise<RequestAuth> {
    const userId = knownUserId ?? (await this.upsertUser(identity)).id;
    const auth: RequestAuth = { userId, clerkUserId: identity.clerkUserId, tenantId: tenantUuid, role };

    // Membership mirror runs inside the tenant's own RLS context.
    this.context.enter(auth);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantUuid}, true)`;
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: tenantUuid, userId } },
        create: { tenantId: tenantUuid, userId, role },
        update: { role },
      });
    });
    return auth;
  }
}

/** A friendly default name for a personal workspace, from the verified identity. */
function personalName(identity: VerifiedIdentity): string {
  const handle = identity.email?.split('@')[0];
  return handle ? `${handle}'s workspace` : 'My workspace';
}
