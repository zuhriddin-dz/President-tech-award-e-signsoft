import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@docflow/db';
import { env } from '../config/env.js';

/**
 * The bare client — connects as the docflow_app runtime role over the pooled
 * URL. NEVER the owner (BYPASSRLS). Tenant-scoped work goes through
 * TenantDb.tx() in src/tenant/, which sets the RLS context; using this client
 * directly is only correct for global tables (users) and health probes.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ datasources: { db: { url: env.APP_DATABASE_URL } } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
