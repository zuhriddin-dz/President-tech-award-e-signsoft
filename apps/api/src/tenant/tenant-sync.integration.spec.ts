/**
 * Live integration: verified-claims → ensure_tenant() → membership mirror →
 * RLS-scoped reads, against the real Neon DB as docflow_app. Skipped when the
 * environment has no real database (CI runs with a dummy URL).
 */
import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from './tenant-context.js';
import { TenantDb } from './tenant-db.js';
import { TenantSyncService } from './tenant-sync.service.js';

const live = env.APP_DATABASE_URL.includes('neon.tech');
const suffix = Date.now().toString(36);
const clerkOrg = `org_itest_${suffix}`;
const clerkUser = `user_itest_${suffix}`;

const prisma = new PrismaService();
const cls = ClsServiceManager.getClsService();
const context = new TenantContext(cls);
const sync = new TenantSyncService(prisma, context);
const db = new TenantDb(prisma, context);

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!live)('tenant sync + RLS end to end (Neon)', () => {
  it('establishes, is idempotent, mirrors membership, and scopes reads', async () => {
    await cls.run(async () => {
      const auth = await sync.establish({
        clerkUserId: clerkUser,
        email: `${suffix}@itest.docflow.invalid`,
        clerkOrgId: clerkOrg,
        orgName: 'Integration Org',
        role: 'ADMIN',
      });
      expect(auth.tenantId).toMatch(/^[0-9a-f-]{36}$/);
      expect(auth.role).toBe('ADMIN');

      // Idempotent: same org → same tenant; rename flows through.
      const again = await sync.establish({
        clerkUserId: clerkUser,
        email: null,
        clerkOrgId: clerkOrg,
        orgName: 'Integration Org Renamed',
        role: 'MEMBER',
      });
      expect(again.tenantId).toBe(auth.tenantId);

      // RLS-scoped: the only visible tenant is ours, with the synced name+role.
      const tenants = await db.tx((tx) => tx.tenant.findMany());
      expect(tenants.map((t) => t.id)).toEqual([auth.tenantId]);
      expect(tenants[0]?.name).toBe('Integration Org Renamed');
      const memberships = await db.tx((tx) => tx.membership.findMany());
      expect(memberships).toHaveLength(1);
      expect(memberships[0]?.role).toBe('MEMBER');

      // Cleanup inside the same context (RLS applies to deletes too).
      await db.tx((tx) => tx.tenant.deleteMany({ where: { clerkOrgId: clerkOrg } }));
      await prisma.user.deleteMany({ where: { clerkUserId: clerkUser } });
    });
  });

  it('refuses a session with no active organization', async () => {
    await cls.run(async () => {
      await expect(
        sync.establish({
          clerkUserId: clerkUser,
          email: null,
          clerkOrgId: null,
          orgName: null,
          role: null,
        }),
      ).rejects.toThrow(/organization/i);
    });
  });
});
