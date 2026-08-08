/**
 * THE RLS PROOF — runs against the real Neon database, on the POOLED url, as
 * the RUNTIME ROLE (docflow_app) — exactly how production will connect.
 * Never the owner: Neon's neondb_owner carries BYPASSRLS and walks through
 * every policy (verified live — that role is migrations-only).
 * If any of this fails, the tenancy model is broken and nothing else matters.
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Local runs read the untracked .env. CI has no such file and injects the
// environment directly, so a missing one is not an error — whether a REAL
// database is reachable is the question that matters, and `live` answers it.
try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  /* no .env file — CI and deploy platforms set the variables themselves */
}

const appUrl = process.env['APP_DATABASE_URL'];

/**
 * RLS is a behaviour of the SERVER, so this proof is worth nothing against
 * anything but the real database — CI's placeholder URL would only prove that
 * a connection fails. Same test as the other integration specs applies.
 *
 * The skip is spelled out in the suite name on purpose. A silent skip on the
 * one test that proves tenants cannot read each other is how a broken policy
 * reaches production with a green tick next to it.
 */
const live = Boolean(appUrl?.includes('neon.tech'));

const db = new PrismaClient({
  // Never connected when !live; Prisma dials lazily, and the suite is skipped.
  datasources: { db: { url: appUrl ?? 'postgresql://unset' } },
});

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// set_config(..., is_local = true) scopes the setting to THIS transaction —
// the one pattern that cannot leak across a pooled connection's next borrower.
async function asTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

const tenantA = randomUUID();
const tenantB = randomUUID();
const userId = randomUUID();
const email = `rls-proof-${tenantA}@example.test`;

// beforeAll/afterAll live INSIDE the suite. At file scope Vitest runs them even
// when the describe is skipped, so they would still dial a database that is not
// there — which is exactly how this file broke CI.
describe.skipIf(!live)(
  live
    ? 'row-level security on the pooled connection'
    : 'row-level security on the pooled connection [SKIPPED — no live database]',
  () => {
    beforeAll(async () => {
      // users is global (no RLS); tenants/memberships must be written in-context.
      await db.user.create({ data: { id: userId, email } });
      await asTenant(tenantA, async (tx) => {
        await tx.tenant.create({ data: { id: tenantA, name: 'Tenant A' } });
        await tx.membership.create({ data: { tenantId: tenantA, userId, role: 'OWNER' } });
      });
      await asTenant(tenantB, async (tx) => {
        await tx.tenant.create({ data: { id: tenantB, name: 'Tenant B' } });
        await tx.membership.create({ data: { tenantId: tenantB, userId, role: 'OWNER' } });
      });
    });

    afterAll(async () => {
      await asTenant(tenantA, (tx) => tx.tenant.deleteMany({ where: { id: tenantA } }));
      await asTenant(tenantB, (tx) => tx.tenant.deleteMany({ where: { id: tenantB } }));
      await db.user.deleteMany({ where: { id: userId } });
      await db.$disconnect();
    });

    it('a tenant context sees ONLY its own rows', async () => {
      const { tenants, memberships } = await asTenant(tenantA, async (tx) => ({
        tenants: await tx.tenant.findMany(),
        memberships: await tx.membership.findMany(),
      }));
      expect(tenants.map((t) => t.id)).toEqual([tenantA]);
      expect(memberships.map((m) => m.tenantId)).toEqual([tenantA]);
    });

    it('a deliberately unscoped cross-tenant read returns NOTHING', async () => {
      // The exact bug RLS exists to survive: code "forgets" the where-clause
      // and even names the other tenant explicitly. The database must refuse.
      const stolen = await asTenant(tenantA, (tx) =>
        tx.tenant.findUnique({ where: { id: tenantB } }),
      );
      expect(stolen).toBeNull();
    });

    it('NO context = NO rows (fail closed)', async () => {
      const [tenants, memberships] = await Promise.all([
        db.tenant.findMany(),
        db.membership.findMany(),
      ]);
      expect(tenants).toEqual([]);
      expect(memberships).toEqual([]);
    });

    it('writing a row for ANOTHER tenant is rejected (WITH CHECK)', async () => {
      await expect(
        asTenant(tenantA, (tx) =>
          tx.membership.create({
            data: { tenantId: tenantB, userId, role: 'VIEWER' },
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('cross-tenant UPDATE and DELETE silently touch zero rows', async () => {
      const { updated, deleted } = await asTenant(tenantA, async (tx) => ({
        updated: await tx.tenant.updateMany({
          where: { id: tenantB },
          data: { name: 'hijacked' },
        }),
        deleted: await tx.membership.deleteMany({ where: { tenantId: tenantB } }),
      }));
      expect(updated.count).toBe(0);
      expect(deleted.count).toBe(0);

      const intact = await asTenant(tenantB, (tx) => tx.tenant.findUnique({ where: { id: tenantB } }));
      expect(intact?.name).toBe('Tenant B');
    });
  },
);
