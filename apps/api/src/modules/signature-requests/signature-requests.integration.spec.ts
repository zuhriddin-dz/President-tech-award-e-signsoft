/**
 * Send flow, live: create a request from a template → token minted & stored
 * HASHED → invite enqueued with the raw token in the sign URL → snapshot is
 * independent of later template edits → cross-tenant isolation. Real Neon;
 * the queue is faked so nothing hits Redis/Resend.
 */
import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { ClsServiceManager } from 'nestjs-cls';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import { TenantDb } from '../../tenant/tenant-db.js';
import { DocumentsService } from '../documents/documents.service.js';
import { TemplatesService } from '../templates/templates.service.js';
import { SignatureRequestsService } from './signature-requests.service.js';

const live = env.APP_DATABASE_URL.includes('neon.tech');

const prisma = new PrismaService();
const cls = ClsServiceManager.getClsService();
const context = new TenantContext(cls);
const storage = new StorageService(context);
const db = new TenantDb(prisma, context);
const documents = new DocumentsService(db, storage);
const templates = new TemplatesService(db, documents);

// Fake queue: record enqueues instead of touching Redis. Enforces BullMQ's
// real constraint (no ':' in a custom job id) so that class of bug can't slip
// past the fake and only fail in production.
const enqueued: { name: string; payload: Record<string, unknown>; key: string }[] = [];
const fakeQueue = {
  enqueue: async (name: string, payload: Record<string, unknown>, key: string) => {
    if (key.includes(':')) throw new Error(`Custom Id cannot contain : (got "${key}")`);
    enqueued.push({ name, payload, key });
  },
} as unknown as import('../../queue/queue.service.js').QueueService;
const requests = new SignatureRequestsService(db, context, fakeQueue);

const tenantA = randomUUID();
const tenantB = randomUUID();

function enter(tenant: string): void {
  context.enter({ userId: randomUUID(), clerkUserId: 'c', tenantId: tenant, role: 'MEMBER' });
}
async function seed(id: string): Promise<void> {
  await db.tx((tx) => tx.tenant.create({ data: { id, name: 'SR ' + id.slice(0, 6) } }));
}
async function templateWithField(): Promise<string> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  const t = await templates.create('Contract', Buffer.from(await pdf.save()));
  await templates.update(t.id, {
    fields: [
      {
        id: randomUUID(),
        type: 'signature',
        page: 1,
        x: 0.1,
        y: 0.8,
        w: 0.2,
        h: 0.05,
        required: true,
        recipientKey: 'signer',
      },
    ],
  });
  return t.id;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!live)('send flow (live Neon, faked queue)', () => {
  it('mints a hashed token, snapshots the template, enqueues the invite', async () => {
    await cls.run(async () => {
      enter(tenantA);
      await seed(tenantA);
      const templateId = await templateWithField();

      enqueued.length = 0;
      const req = await requests.send(
        { templateId, recipientEmail: 'signer@example.com', recipientName: 'Sam' },
        'sender@acme.test',
      );
      expect(req.status).toBe('sent');
      expect(req.recipientEmail).toBe('signer@example.com');

      // One invite enqueued, keyed idempotently by request id.
      expect(enqueued).toHaveLength(1);
      expect(enqueued[0]?.key).toBe(`invite-${req.id}`);
      const signUrl = enqueued[0]?.payload.signUrl as string;
      const rawToken = signUrl.split('/sign/')[1];
      expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

      // The stored hash equals sha256(raw token) — the raw value is NOT stored.
      const row = await db.tx((tx) =>
        tx.signatureRequest.findUnique({
          where: { id: req.id },
          select: { signingTokenHash: true, fields: true },
        }),
      );
      expect(row?.signingTokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));

      // Snapshot independence: edit the template, the request's fields are unchanged.
      const beforeLen = (row?.fields as unknown[]).length;
      await templates.update(templateId, { fields: [] });
      const after = await db.tx((tx) =>
        tx.signatureRequest.findUnique({ where: { id: req.id }, select: { fields: true } }),
      );
      expect((after?.fields as unknown[]).length).toBe(beforeLen);
      expect(beforeLen).toBe(1);

      // Cleanup A.
      await db.tx((tx) => tx.signatureRequest.deleteMany({ where: { id: req.id } }));
      const tpl = await db.tx((tx) =>
        tx.template.findUnique({ where: { id: templateId }, select: { documentId: true } }),
      );
      await db.tx((tx) => tx.template.deleteMany({ where: { id: templateId } }));
      if (tpl) {
        const d = await db.tx((tx) =>
          tx.document.findUnique({ where: { id: tpl.documentId }, select: { storageKey: true } }),
        );
        if (d) await storage.delete(d.storageKey);
        await db.tx((tx) => tx.document.deleteMany({ where: { id: tpl.documentId } }));
      }
      await db.tx((tx) => tx.tenant.deleteMany({ where: { id: tenantA } }));
    });
  }, 90_000);

  it('a failed invite enqueue rolls the request back (no phantom "waiting" row)', async () => {
    // The exact failure the owner hit: Redis down. The send must fail fast AND
    // leave nothing behind — a row whose email will never arrive would make the
    // dashboard claim something we didn't do.
    const failingQueue = {
      enqueue: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
      },
    } as unknown as import('../../queue/queue.service.js').QueueService;
    const failing = new SignatureRequestsService(db, context, failingQueue);

    await cls.run(async () => {
      enter(tenantA);
      await seed(tenantA);
      const templateId = await templateWithField();

      await expect(
        failing.send({ templateId, recipientEmail: 'signer@example.com' }, 'sender@acme.test'),
      ).rejects.toMatchObject({ status: 503 });

      // Nothing stranded.
      expect(await requests.list()).toEqual([]);

      // Cleanup.
      const tpl = await db.tx((tx) =>
        tx.template.findUnique({ where: { id: templateId }, select: { documentId: true } }),
      );
      await db.tx((tx) => tx.template.deleteMany({ where: { id: templateId } }));
      if (tpl) {
        const d = await db.tx((tx) =>
          tx.document.findUnique({ where: { id: tpl.documentId }, select: { storageKey: true } }),
        );
        if (d) await storage.delete(d.storageKey);
        await db.tx((tx) => tx.document.deleteMany({ where: { id: tpl.documentId } }));
      }
      await db.tx((tx) => tx.tenant.deleteMany({ where: { id: tenantA } }));
    });
  }, 90_000);

  it('tenant B cannot see tenant A requests, and a foreign template 404s', async () => {
    await cls.run(async () => {
      enter(tenantB);
      await seed(tenantB);
      expect(await requests.list()).toEqual([]);
      await expect(
        requests.send({ templateId: randomUUID(), recipientEmail: 'x@y.com' }, null),
      ).rejects.toThrow();
      await db.tx((tx) => tx.tenant.deleteMany({ where: { id: tenantB } }));
    });
  });
});
