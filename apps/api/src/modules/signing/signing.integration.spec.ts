/**
 * Public signing surface, live: resolve token → view (records first view) →
 * submit (atomic single-use claim) → a SECOND submit is refused → a wrong
 * token is a uniform 404. Real Neon + real R2; queue faked.
 */
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { ClsServiceManager } from 'nestjs-cls';
import { mintSigningToken } from '@docflow/crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@docflow/db';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import { TenantDb } from '../../tenant/tenant-db.js';
import { SigningTokenResolver } from '../../tenant/signing-token.resolver.js';
import { SigningService } from './signing.service.js';

const live =
  env.S3_ENDPOINT.includes('r2.cloudflarestorage.com') && env.APP_DATABASE_URL.includes('neon.tech');

const prisma = new PrismaService();
const cls = ClsServiceManager.getClsService();
const context = new TenantContext(cls);
const storage = new StorageService(context);
const db = new TenantDb(prisma, context);
const resolver = new SigningTokenResolver(prisma, context);
const fakeQueue = { enqueue: async () => {} } as unknown as import('../../queue/queue.service.js').QueueService;
const signing = new SigningService(resolver, db, storage, fakeQueue);

// 1x1 PNG data URL — a real, minimal PNG the server-side guard accepts.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

const tenantId = randomUUID();

function enterOwner(): void {
  context.enter({ userId: randomUUID(), clerkUserId: 'c', tenantId, role: 'MEMBER' });
}
async function inTenant<T>(fn: (t: PrismaClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (t) => {
    await t.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(t as unknown as PrismaClient);
  });
}

const FIELD = { id: randomUUID(), type: 'signature', page: 1, x: 0.1, y: 0.8, w: 0.2, h: 0.05, required: true, recipientKey: 'signer' };

async function seedRequest(): Promise<string> {
  enterOwner();
  await inTenant((t) => t.tenant.create({ data: { id: tenantId, name: 'Sign IT' } }));
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  const bytes = Buffer.from(await pdf.save());
  const storageKey = `tenants/${tenantId}/documents/${randomUUID()}`;
  await storage.put(storageKey, bytes, 'application/pdf');
  const doc = await inTenant((t) =>
    t.document.create({
      data: { name: 'Sign.pdf', contentType: 'application/pdf', byteSize: bytes.length, sha256: 'x', storageKey },
    }),
  );
  await inTenant((t) =>
    t.template.create({
      data: { name: 'Sign NDA', documentId: doc.id, pageCount: 1, pageSizes: [{ w: 595, h: 842 }], fields: [FIELD] },
    }),
  );
  const { token, sha256 } = mintSigningToken();
  await inTenant((t) =>
    t.signatureRequest.create({
      data: { documentId: doc.id, documentName: 'Sign NDA', fields: [FIELD], recipientEmail: 's@e.com', signingTokenHash: sha256, createdByUserId: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) },
    }),
  );
  return token;
}

afterAll(async () => {
  const admin = new PrismaService();
  try {
    await admin.$executeRawUnsafe(`DELETE FROM signature_requests WHERE document_name = 'Sign NDA'`);
    await admin.$executeRawUnsafe(`DELETE FROM templates WHERE name = 'Sign NDA'`);
    await admin.$executeRawUnsafe(`DELETE FROM documents WHERE name = 'Sign.pdf'`);
    await admin.$executeRawUnsafe(`DELETE FROM tenants WHERE id = '${tenantId}'`);
  } finally {
    await admin.$disconnect();
  }
  await prisma.$disconnect();
});

describe.skipIf(!live)('public signing surface (live)', () => {
  it('resolves, views, and atomically claims exactly once', async () => {
    const token = await cls.run(seedRequest);

    const view = await cls.run(() => signing.view(token, '1.2.3.4', 'test-agent'));
    expect(view.documentName).toBe('Sign NDA');
    expect(view.completed).toBe(false);
    expect(view.fields.length).toBe(1);

    const first = await cls.run(() =>
      signing.submit(token, { consent: true, method: 'typed', signatureImage: PNG }, '1.2.3.4', 'ua'),
    );
    expect(first).toEqual({ ok: true });

    // Second submit on the consumed token → uniform 404.
    await cls.run(async () => {
      await expect(
        signing.submit(token, { consent: true, method: 'typed', signatureImage: PNG }, '1.2.3.4', 'ua'),
      ).rejects.toMatchObject({ status: 404 });
    });

    const row = await cls.run(async () => {
      enterOwner();
      return inTenant((t) => t.signatureRequest.findFirst({ where: { documentName: 'Sign NDA' } }));
    });
    expect(row?.status).toBe('completed');
    expect(row?.signatureMethod).toBe('typed');
    expect(row?.signatureImageKey).toContain(`tenants/${tenantId}/signatures/`);
  }, 90_000);

  it('a wrong/unknown token is a uniform 404', async () => {
    await cls.run(async () => {
      await expect(signing.view(mintSigningToken().token, null, null)).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
