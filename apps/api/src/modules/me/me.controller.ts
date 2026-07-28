import { Controller, Get } from '@nestjs/common';
import { Policy } from '../../common/policy.js';
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

  @Get()
  @Policy('viewer')
  async me(): Promise<{
    userId: string;
    role: string;
    tenant: { id: string; name: string; kind: string; createdAt: string } | null;
  }> {
    const auth = this.context.requireAuth();
    // findMany, not findUnique-by-id: under RLS the only visible tenant IS
    // ours — the query itself is the isolation proof.
    const tenants = await this.db.tx((tx) =>
      tx.tenant.findMany({ select: { id: true, name: true, kind: true, createdAt: true } }),
    );
    const tenant = tenants[0];
    return {
      userId: auth.userId,
      role: auth.role,
      // createdAt drives the trial countdown in the shell — the age of the
      // workspace is the only honest source for "N days left".
      tenant: tenant ? { ...tenant, createdAt: tenant.createdAt.toISOString() } : null,
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
