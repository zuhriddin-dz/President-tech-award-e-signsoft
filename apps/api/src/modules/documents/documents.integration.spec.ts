/**
 * Full slice, live: upload → RLS-scoped list → byte-identical download →
 * cross-tenant invisibility. Real Neon (docflow_app) + real R2.
 */
import { randomUUID } from 'node:crypto';
import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import { TenantDb } from '../../tenant/tenant-db.js';
import { DocumentsService } from './documents.service.js';

const live =
  env.S3_ENDPOINT.includes('r2.cloudflarestorage.com') &&
  env.APP_DATABASE_URL.includes('neon.tech');

const prisma = new PrismaService();
const cls = ClsServiceManager.getClsService();
const context = new TenantContext(cls);
const storage = new StorageService(context);
const db = new TenantDb(prisma, context);
const documents = new DocumentsService(db, storage);

// A minimal but real PDF header + payload — passes the magic check.
const pdfBytes = Buffer.concat([
  Buffer.from('%PDF-1.7\n% docflow storage proof\n'),
  Buffer.from(randomUUID().repeat(50)),
]);

const tenantA = randomUUID();
const tenantB = randomUUID();

function enter(tenant: string): void {
  context.enter({ userId: 'u', clerkUserId: 'c', tenantId: tenant, role: 'MEMBER' });
}

async function seedTenant(id: string, name: string): Promise<void> {
  await db.tx((tx) => tx.tenant.create({ data: { id, name } }));
}

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!live)('documents slice (live Neon + R2)', () => {
  it('uploads, lists, downloads byte-identical — and the other tenant sees nothing', async () => {
    await cls.run(async () => {
      enter(tenantA);
      await seedTenant(tenantA, 'Doc Tenant A');

      const created = await documents.create('  Q3 contract.pdf ', pdfBytes, 'application/pdf');
      expect(created.byteSize).toBe(pdfBytes.length);
      expect(created.sha256).toMatch(/^[0-9a-f]{64}$/);

      const listed = await documents.list();
      expect(listed.map((d) => d.id)).toEqual([created.id]);

      const dl = await documents.download(created.id);
      expect((await drain(dl.stream)).equals(pdfBytes)).toBe(true);

      // Tenant B: same database, same code path — zero visibility.
      enter(tenantB);
      await seedTenant(tenantB, 'Doc Tenant B');
      expect(await documents.list()).toEqual([]);
      await expect(documents.download(created.id)).rejects.toThrow();

      // Cleanup (each under its own context; storage object too).
      enter(tenantA);
      const row = await db.tx((tx) => tx.document.findUnique({ where: { id: created.id } }));
      if (row) await storage.delete(row.storageKey);
      await db.tx((tx) => tx.document.deleteMany({}));
      await db.tx((tx) => tx.tenant.deleteMany({ where: { id: tenantA } }));
      enter(tenantB);
      await db.tx((tx) => tx.tenant.deleteMany({ where: { id: tenantB } }));
    });
  }, 90_000);

  it('rejects non-PDF bytes', async () => {
    await cls.run(async () => {
      enter(tenantA);
      await expect(
        documents.create('evil.pdf', Buffer.from('MZ not a pdf'), 'application/pdf'),
      ).rejects.toThrow(/PDF/);
    });
  });
});
