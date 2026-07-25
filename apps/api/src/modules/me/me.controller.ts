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
    tenant: { id: string; name: string; kind: string } | null;
  }> {
    const auth = this.context.requireAuth();
    // findMany, not findUnique-by-id: under RLS the only visible tenant IS
    // ours — the query itself is the isolation proof.
    const tenants = await this.db.tx((tx) =>
      tx.tenant.findMany({ select: { id: true, name: true, kind: true } }),
    );
    return { userId: auth.userId, role: auth.role, tenant: tenants[0] ?? null };
  }

  @Get('admin-check')
  @Policy('admin')
  adminCheck(): { ok: true } {
    return { ok: true };
  }
}
