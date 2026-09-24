import { Controller, Get } from '@nestjs/common';
import type { MeResponse } from '@docflow/contracts';
import { AllowWhenLocked, Policy } from '../../common/policy.js';
import { tenantAccess } from '../../common/trial.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import { TenantDb } from '../../tenant/tenant-db.js';

/**
 * The first authenticated slice — deliberately tiny. /me proves the whole
 * chain (verify → sync → RLS-scoped read); /me/admin-check proves the RBAC
 * floor. Real domains copy this shape from Phase 7 on.
 */
@Controller('me')
export class MeController {
  constructor(
    private readonly context: TenantContext,
    private readonly db: TenantDb,
  ) {}

  /**
   * Stays open on a locked workspace, because this is the call the shell makes
   * to FIND OUT it is locked. Refusing it would leave the product with nothing
   * to render but an error.
   */
  @Get()
  @Policy('viewer')
  @AllowWhenLocked()
  async me(): Promise<MeResponse> {
    const auth = this.context.requireAuth();
    // findMany, not findUnique-by-id: under RLS the only visible tenant IS
    // ours — the query itself is the isolation proof.
    const tenants = await this.db.tx((tx) =>
      tx.tenant.findMany({
        select: {
          id: true,
          name: true,
          kind: true,
          createdAt: true,
          plan: true,
          trialEndsAt: true,
          paidUntil: true,
        },
      }),
    );
    const tenant = tenants[0];
    return {
      userId: auth.userId,
      role: auth.role,
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            kind: tenant.kind,
            createdAt: tenant.createdAt.toISOString(),
            plan: tenant.plan,
            // Decided HERE, by the same function the guard locks on, so the
            // screen and the gate can never tell the customer different things.
            access: tenantAccess(tenant.plan, tenant.trialEndsAt, tenant.paidUntil, new Date()),
          }
        : null,
    };
  }

  /**
   * Who is in this workspace. RLS scopes the memberships; the join to users is
   * by id from rows we can already see, so it cannot widen the result. Only
   * the address and role are returned — never Clerk ids.
   */
  @Get('members')
  @Policy('viewer')
  async members(): Promise<{
    members: { id: string; email: string; role: string; joinedAt: string }[];
  }> {
    const rows = await this.db.tx((tx) =>
      tx.membership.findMany({
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { email: true } } },
      }),
    );
    return {
      members: rows.map((m) => ({
        id: m.id,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
    };
  }

  @Get('admin-check')
  @Policy('admin')
  adminCheck(): { ok: true } {
    return { ok: true };
  }
}
