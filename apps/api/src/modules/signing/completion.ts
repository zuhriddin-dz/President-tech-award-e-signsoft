import {
  SealService,
  buildCertificatePdf,
  parseSealRing,
  sha256Hex,
  type CertificateInput,
} from '@docflow/crypto';
import type { TemplateField } from '@docflow/contracts';
import { env } from '../../config/env.js';
import { ResendSender } from '../../email/resend.sender.js';
import { buildSignedCopyEmail } from '../../email/signed-copy-email.js';
import { getObject, putObject, siblingKey } from '../../storage/worker-storage.js';
import { runInTenant } from '../../tenant/worker-tenant-db.js';
import { stampPdf } from './stamp-pdf.js';

/**
 * The completion pipeline — the product's whole point, run OFF the request
 * path by the worker: stamp → SHA-256 → Ed25519 seal → Certificate of
 * Completion → store → email both parties.
 *
 * IDEMPOTENT by construction: the first thing it does is check whether this
 * request already has a signed PDF, and if so it stops. A BullMQ retry (or a
 * duplicate delivery after a crash) therefore cannot produce a second signed
 * document or a second email — which matters because the seal binds a single
 * documentHash to this request, and two different signed PDFs would make the
 * evidence ambiguous.
 */
const seal = new SealService(parseSealRing(env.ESIGN_SEAL_KEYS));
const email = new ResendSender();

export async function completeSignature(tenant: string, requestId: string): Promise<void> {
  // 1. Load everything under the tenant's own RLS context.
  const req = await runInTenant(tenant, (tx) =>
    tx.signatureRequest.findUnique({ where: { id: requestId } }),
  );
  if (!req) throw new Error(`completion: request ${requestId} not found`);
  if (req.signedPdfKey) return; // already completed — idempotent no-op
  if (req.status !== 'completed') throw new Error(`completion: request ${requestId} is not signed`);
  if (!req.signatureImageKey || !req.completedAt) {
    throw new Error(`completion: request ${requestId} has no signature`);
  }

  const doc = await runInTenant(tenant, (tx) =>
    tx.document.findUnique({ where: { id: req.documentId }, select: { storageKey: true } }),
  );
  if (!doc) throw new Error(`completion: document for ${requestId} not found`);

  // 2. Stamp the signature + field values into the source PDF.
  const [sourcePdf, signaturePng] = await Promise.all([
    getObject(doc.storageKey),
    getObject(req.signatureImageKey),
  ]);
  const signedPdf = await stampPdf({
    pdfBytes: sourcePdf,
    fields: req.fields as TemplateField[],
    fieldValues: (req.fieldValues ?? {}) as Record<string, string>,
    signaturePng,
  });

  // 3. Fingerprint + seal. The seal is bound to THIS request and signing time,
  // so the triple cannot be lifted onto another row and still verify.
  const documentHash = sha256Hex(signedPdf);
  const { signature: sealSignature, kid: sealKid } = seal.seal({
    requestId: req.id,
    signedAt: req.completedAt,
    documentHash,
  });

  // 4. The Certificate of Completion — the evidence artifact.
  const certificate: CertificateInput = {
    requestId: req.id,
    documentName: req.documentName,
    signerName: req.recipientName,
    signerEmail: req.recipientEmail,
    signerUserId: null,
    senderEmail: req.senderEmail,
    signerIp: req.signerIp,
    signerUserAgent: req.signerUserAgent,
    sentAt: req.sentAt,
    viewedAt: req.viewedAt,
    consentAt: req.consentAt,
    signedAt: req.completedAt,
    method: methodLabel(req.signatureMethod),
    documentHash,
    sealSignature,
    sealKid,
  };
  const certificatePdf = await buildCertificatePdf(certificate);

  // 5. Store both artifacts BEFORE recording them: a crash here leaves orphan
  // objects (lifecycle-swept), never a row pointing at bytes that don't exist.
  const signedPdfKey = siblingKey(doc.storageKey, 'signed');
  const certificateKey = siblingKey(doc.storageKey, 'certificates');
  await Promise.all([
    putObject(signedPdfKey, signedPdf, 'application/pdf'),
    putObject(certificateKey, certificatePdf, 'application/pdf'),
  ]);

  await runInTenant(tenant, (tx) =>
    tx.signatureRequest.updateMany({
      // Only fill in artifacts once — a racing duplicate job writes nothing.
      where: { id: req.id, signedPdfKey: null },
      data: { signedPdfKey, certificateKey, documentHash, sealSignature, sealKid },
    }),
  );

  // 6. Email both parties their copy. Sending is last: a mail failure must
  // never roll back a completed, sealed signature (the retry re-sends only).
  const attachments = [
    { filename: safeName(req.documentName), content: signedPdf },
    { filename: 'certificate-of-completion.pdf', content: certificatePdf },
  ];
  await email.send({
    ...buildSignedCopyEmail({
      documentName: req.documentName,
      recipientName: req.recipientName,
      isSender: false,
    }),
    to: req.recipientEmail,
    attachments,
  });
  if (req.senderEmail && req.senderEmail !== req.recipientEmail) {
    await email.send({
      ...buildSignedCopyEmail({
        documentName: req.documentName,
        recipientName: req.recipientName,
        isSender: true,
      }),
      to: req.senderEmail,
      attachments,
    });
  }
}

function methodLabel(method: string | null): string {
  switch (method) {
    case 'typed':
      return 'Typed signature';
    case 'drawn':
      return 'Drawn signature';
    case 'uploaded':
      return 'Uploaded signature image';
    default:
      return 'Electronic signature';
  }
}

/** A filename safe for a mail client; always ends in .pdf. */
function safeName(documentName: string): string {
  const base = documentName.replace(/[^A-Za-z0-9 ._-]/g, '').trim() || 'signed-document';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}
