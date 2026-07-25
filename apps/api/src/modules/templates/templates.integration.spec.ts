/**
 * Templates slice, live: upload+create → list → get → tag fields (PATCH) →
 * snapshot geometry → bad-page rejection → cross-tenant invisibility. Real
 * Neon (docflow_app) + real R2.
 */
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import { TenantDb } from '../../tenant/tenant-db.js';
import { DocumentsService } from '../documents/documents.service.js';
import { TemplatesService } from './templates.service.js';

const live =
  env.S3_ENDPOINT.includes('r2.cloudflarestorage.com') &&
  env.APP_DATABASE_URL.includes('neon.tech');

const prisma = new PrismaService();
const cls = ClsServiceManager.getClsService();
const context = new TenantContext(cls);
const storage = new StorageService(context);
const db = new TenantDb(prisma, context);
const documents = new DocumentsService(db, storage);
const templates = new TemplatesService(db, documents);

const tenantA = randomUUID();
const tenantB = randomUUID();

function enter(tenant: string): void {
  context.enter({ userId: 'u', clerkUserId: 'c', tenantId: tenant, role: 'MEMBER' });
}
async function seed(id: string, name: string): Promise<void> {
  await db.tx((tx) => tx.tenant.create({ data: { id, name } }));
}
async function twoPagePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  pdf.addPage([595, 842]);
  return Buffer.from(await pdf.save());
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!live)('templates slice (live Neon + R2)', () => {
  it('creates from an uploaded PDF, tags fields, and isolates by tenant', async () => {
    await cls.run(async () => {
      enter(tenantA);
      await seed(tenantA, 'Tpl Tenant A');

      const created = await templates.create('  Onboarding NDA  ', await twoPagePdf());
      expect(created.name).toBe('Onboarding NDA');
      expect(created.pageCount).toBe(2);
      expect(created.pageSizes).toHaveLength(2);
      expect(created.fields).toEqual([]);

      const listed = await templates.list();
      expect(listed.map((t) => t.id)).toContain(created.id);
      // Summary omits the heavy layout.
      expect(listed.find((t) => t.id === created.id)).not.toHaveProperty('fields');

      // Tag a signature on page 1 and a date on page 2.
      const fields = [
        {
          id: randomUUID(),
          type: 'signature' as const,
          page: 1,
          x: 0.1,
          y: 0.8,
          w: 0.25,
          h: 0.06,
          required: true,
          recipientKey: 'signer',
        },
        {
          id: randomUUID(),
          type: 'date' as const,
          page: 2,
          x: 0.6,
          y: 0.1,
          w: 0.2,
          h: 0.04,
          required: true,
          recipientKey: 'signer',
        },
      ];
      const tagged = await templates.update(created.id, { fields });
      expect(tagged.fields).toHaveLength(2);
      expect(tagged.fields[0].type).toBe('signature');

      // A field on a page the document does not have is rejected.
      await expect(
        templates.update(created.id, {
          fields: [{ ...fields[0], page: 3 }],
        }),
      ).rejects.toThrow(/page 3/);

      // Tenant B sees nothing and cannot fetch A's template.
      enter(tenantB);
      await seed(tenantB, 'Tpl Tenant B');
      expect(await templates.list()).toEqual([]);
      await expect(templates.get(created.id)).rejects.toThrow();
      await expect(templates.update(created.id, { name: 'hijack' })).rejects.toThrow();

      // Cleanup.
      enter(tenantA);
      const doc = await db.tx((tx) =>
        tx.template.findUnique({ where: { id: created.id }, select: { documentId: true } }),
      );
      await db.tx((tx) => tx.template.deleteMany({ where: { id: created.id } }));
      if (doc) {
        const d = await db.tx((tx) =>
          tx.document.findUnique({ where: { id: doc.documentId }, select: { storageKey: true } }),
        );
        if (d) await storage.delete(d.storageKey);
        await db.tx((tx) => tx.document.deleteMany({ where: { id: doc.documentId } }));
      }
      await db.tx((tx) => tx.tenant.deleteMany({ where: { id: tenantA } }));
      enter(tenantB);
      await db.tx((tx) => tx.tenant.deleteMany({ where: { id: tenantB } }));
    });
  }, 90_000);

  it('rejects a non-PDF upload', async () => {
    await cls.run(async () => {
      enter(tenantA);
      await expect(templates.create('bad', Buffer.from('nope'))).rejects.toThrow(/PDF/);
    });
  });
});
