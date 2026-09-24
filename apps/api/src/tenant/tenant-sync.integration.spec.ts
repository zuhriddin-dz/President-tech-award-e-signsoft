/**
 * Live integration: verified-claims → ensure_tenant() → membership mirror →
 * RLS-scoped reads, against the real Neon DB as docflow_app. Skipped when the
 * environment has no real database (CI runs with a dummy URL).
 */
import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { tenantAccess } from '../common/trial.js';
import { databaseUp } from '../test-support/live.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from './tenant-context.js';
import { TenantDb } from './tenant-db.js';
import { TenantSyncService } from './tenant-sync.service.js';

// A socket probe, not a hostname match: CI stands a Postgres up and this
// suite must run there. See src/test-support/live.ts.
const live = await databaseUp(env.APP_DATABASE_URL);
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

  it('concurrent first requests from a brand-new org do not race (ON CONFLICT)', async () => {
    const raceOrg = `org_race_${Date.now().toString(36)}`;
    const identity = {
      clerkUserId: `user_race_${suffix}`,
      email: `race-${suffix}@itest.docflow.invalid`,
      clerkOrgId: raceOrg,
      orgName: 'Race Org',
      role: 'ADMIN' as const,
    };
    // Two parallel establishes, each in its own CLS scope — the exact shape of
    // a fresh signup firing /me and /documents at once. Old code 500'd here.
    const results = await Promise.all([
      cls.run(() => sync.establish(identity)),
      cls.run(() => sync.establish(identity)),
    ]);
    expect(results[0].tenantId).toBe(results[1].tenantId);

    await cls.run(async () => {
      context.enter(results[0]);
      await db.tx((tx) => tx.tenant.deleteMany({ where: { clerkOrgId: raceOrg } }));
      await prisma.user.deleteMany({ where: { clerkUserId: identity.clerkUserId } });
    });
  });

  it('a no-org user with no personal workspace must onboard', async () => {
    await cls.run(async () => {
      await expect(
        sync.establish({
          clerkUserId: `user_noworkspace_${suffix}`,
          email: null,
          clerkOrgId: null,
          orgName: null,
          role: null,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  it('establishPersonal creates a personal workspace, then establish reuses it', async () => {
    const personalUser = `user_personal_${suffix}`;
    const identity = {
      clerkUserId: personalUser,
      email: `${suffix}@personal.docflow.invalid`,
      clerkOrgId: null,
      orgName: null,
      role: null,
    };
    await cls.run(async () => {
      const created = await sync.establishPersonal(identity);
      expect(created.role).toBe('OWNER');

      // A subsequent request with no org reuses the personal tenant (no onboarding).
      const reused = await sync.establish(identity);
      expect(reused.tenantId).toBe(created.tenantId);

      // It is a personal-kind tenant, RLS-scoped to itself.
      const tenants = await db.tx((tx) => tx.tenant.findMany());
      expect(tenants).toHaveLength(1);
      expect(tenants[0]?.kind).toBe('personal');

      await db.tx((tx) => tx.tenant.deleteMany({ where: { personalUserId: personalUser } }));
      await prisma.user.deleteMany({ where: { clerkUserId: personalUser } });
    });
  });

  it('loads the trial with the membership, and a lapsed or paid workspace reads as such next request', async () => {
    const trialOrg = `org_trial_${suffix}`;
    const identity = {
      clerkUserId: `user_trial_${suffix}`,
      email: `trial-${suffix}@itest.docflow.invalid`,
      clerkOrgId: trialOrg,
      orgName: 'Trial Org',
      role: 'OWNER' as const,
    };
    const stateOf = (auth: Awaited<ReturnType<typeof sync.establish>>) =>
      tenantAccess(
        auth.entitlement!.plan,
        auth.entitlement!.trialEndsAt,
        auth.entitlement!.paidUntil,
        new Date(),
      ).state;

    await cls.run(async () => {
      // A brand-new workspace, created by the SECURITY DEFINER bootstrap: the
      // 7 days come from the DATABASE default, and survive the round trip into
      // a JS Date without a timezone shift.
      const auth = await sync.establish(identity);
      expect(auth.entitlement?.plan).toBe('trial');
      const days = (auth.entitlement!.trialEndsAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThan(7.01);
      expect(stateOf(auth)).toBe('trial');

      // Past its deadline, the very next request sees it — the row is read
      // fresh every time, so a trial ends with no job to fire.
      await db.tx((tx) =>
        tx.tenant.updateMany({ data: { trialEndsAt: new Date(Date.now() - 60_000) } }),
      );
      expect(stateOf(await sync.establish(identity))).toBe('ended');

      // And a workspace switched to pro is unlocked just as immediately.
      await db.tx((tx) => tx.tenant.updateMany({ data: { plan: 'pro' } }));
      expect(stateOf(await sync.establish(identity))).toBe('pro');

      await db.tx((tx) => tx.tenant.deleteMany({ where: { clerkOrgId: trialOrg } }));
      await prisma.user.deleteMany({ where: { clerkUserId: identity.clerkUserId } });
    });
  });
});
