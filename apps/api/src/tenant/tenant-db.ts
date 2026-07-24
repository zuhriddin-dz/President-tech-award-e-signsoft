import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from './tenant-context.js';

/** The interactive-transaction client Prisma hands to $transaction callbacks. */
export type Tx = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Every tenant-scoped query runs through tx(): one transaction, RLS context
 * set first via set_config(..., is_local=true) — transaction-local, so it can
 * never leak to the pooled connection's next borrower. The tenant id comes
 * from TenantContext (verified session), never from a caller argument.
 */
@Injectable()
export class TenantDb {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContext,
  ) {}

  async tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const { tenantId } = this.context.requireAuth();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx as Tx);
    });
  }
}
