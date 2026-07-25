// Full send path against real Neon + real BullMQ, THEN drain the queue with a
// real worker that sends via Resend to the owner's own inbox. Proves Phase 8
// end to end. Cleans up the tenant afterward.
import { randomUUID } from 'node:crypto';
process.loadEnvFile('.env');
const { PrismaClient } = await import('@docflow/db');
const { mintSigningToken } = await import('@docflow/crypto');
const { Queue, Worker } = await import('bullmq');
const { Resend } = await import('resend');

const prisma = new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } });
const tenantId = randomUUID();
const OWNER_EMAIL = 'zuhriddinjorakobilov@gmail.com';

async function tx(fn) {
  return prisma.$transaction(async (t) => {
    await t.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(t);
  });
}

try {
  // Seed tenant + a document + template with a field.
  await tx((t) => t.tenant.create({ data: { id: tenantId, name: 'LiveSend Test' } }));
  const doc = await tx((t) =>
    t.document.create({
      data: { name: 'Live.pdf', contentType: 'application/pdf', byteSize: 10, sha256: 'x', storageKey: `tenants/${tenantId}/documents/${randomUUID()}` },
    }),
  );
  const tpl = await tx((t) =>
    t.template.create({
      data: { name: 'Live NDA', documentId: doc.id, pageCount: 1, pageSizes: [{ w: 595, h: 842 }], fields: [{ id: randomUUID(), type: 'signature', page: 1, x: 0.1, y: 0.8, w: 0.2, h: 0.05, required: true, recipientKey: 'signer' }] },
    }),
  );

  // The send: mint token, store hash, create request, enqueue invite.
  const { token, sha256 } = mintSigningToken();
  const req = await tx((t) =>
    t.signatureRequest.create({
      data: { templateId: tpl.id, documentId: doc.id, documentName: tpl.name, fields: tpl.fields, recipientEmail: OWNER_EMAIL, recipientName: 'Owner', signingTokenHash: sha256, createdByUserId: randomUUID(), expiresAt: new Date(Date.now() + 14 * 86400000) },
    }),
  );
  const signUrl = `${process.env.SIGN_APP_URL}/sign/${token}`;

  const queue = new Queue('docflow', { connection: { url: process.env.REDIS_URL } });
  await queue.add('send-signing-invite', { to: OWNER_EMAIL, recipientName: 'Owner', documentName: tpl.name, senderName: 'DocFlow Test', signUrl }, { jobId: `invite-${req.id}`, removeOnComplete: true, removeOnFail: true });
  console.log('enqueued invite for request', req.id);

  // Drain with a real worker that sends via Resend.
  const resend = new Resend(process.env.RESEND_API_KEY);
  const done = new Promise((resolve, reject) => {
    const w = new Worker('docflow', async (job) => {
      const d = job.data;
      const { error } = await resend.emails.send({ from: process.env.EMAIL_FROM, to: d.to, subject: `DocFlow — sign "${d.documentName}"`, html: `<p>Review &amp; sign: <a href="${d.signUrl}">link</a></p>`, text: `Review & sign: ${d.signUrl}` });
      if (error) throw new Error('Resend: ' + error.message);
    }, { connection: { url: process.env.REDIS_URL }, concurrency: 1 });
    w.on('completed', async () => { await w.close(); resolve('sent'); });
    w.on('failed', async (_j, err) => { await w.close(); reject(err); });
  });
  console.log('EMAIL RESULT:', await done);
  await queue.close();
} catch (e) {
  console.log('FAILED:', e.message);
} finally {
  await tx((t) => t.signatureRequest.deleteMany({ where: { documentName: 'Live NDA' } }));
  await tx((t) => t.template.deleteMany({ where: { name: 'Live NDA' } }));
  await tx((t) => t.document.deleteMany({ where: { name: 'Live.pdf' } }));
  await tx((t) => t.tenant.deleteMany({ where: { id: tenantId } }));
  await prisma.$disconnect();
  console.log('cleaned up');
}
