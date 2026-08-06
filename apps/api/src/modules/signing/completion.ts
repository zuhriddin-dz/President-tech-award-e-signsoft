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
  // Fully done only when BOTH the artifacts exist and the copies went out.
  // Returning on signedPdfKey alone would let a retry that follows a mail
  // failure report success while nobody ever receives their document.
  if (req.signedPdfKey && req.completionEmailedAt) return;
  if (req.status !== 'completed') throw new Error(`completion: request ${requestId} is not signed`);
  // The seal binds to this instant, so there is nothing to sign over without it.
  // Whether a SIGNATURE exists cannot be decided yet: since routing it lives on
  // the recipients rows, which are not loaded until the stamping step below.
  if (!req.completedAt) {
    throw new Error(`completion: request ${requestId} has no completion time`);
  }

  // Already sealed but not yet delivered (a previous run died at the mail
  // step): reuse the EXISTING artifacts. Re-stamping would produce different
  // bytes than the ones the seal on file covers.
  if (req.signedPdfKey && req.certificateKey) {
    const [signedPdf, certificatePdf] = await Promise.all([
      getObject(req.signedPdfKey),
      getObject(req.certificateKey),
    ]);
    await deliver(tenant, req, signedPdf, certificatePdf);
    return;
  }

  const doc = await runInTenant(tenant, (tx) =>
    tx.document.findUnique({ where: { id: req.documentId }, select: { storageKey: true } }),
  );
  if (!doc) throw new Error(`completion: document for ${requestId} not found`);

  // 2. Stamp EVERY signer's mark and values into the source PDF. Each person
  // owns the fields carrying their recipientKey, so one pass per signer places
  // their signature in their own boxes and nobody else's.
  const recipients = await runInTenant(tenant, (tx) =>
    tx.recipient.findMany({ where: { requestId: req.id }, orderBy: { routingOrder: 'asc' } }),
  );
  const allFields = req.fields as TemplateField[];
  const sourcePdf = await getObject(doc.storageKey);

  const signedSigners = recipients.filter(
    (r) => r.role === 'signer' && r.status === 'completed' && r.signatureImageKey,
  );
  // A signature lives in ONE of two places: the recipients rows (every envelope
  // since routing) or the legacy request column (older single-signer rows).
  // Checked here, once both are in hand — asserting the legacy column earlier
  // stranded every new envelope: signed and completed, but never sealed,
  // because the only copy of the signature was somewhere the guard never read.
  if (signedSigners.length === 0 && !req.signatureImageKey) {
    throw new Error(`completion: request ${requestId} has no signature`);
  }
  // Legacy envelopes (pre-routing) carry their signature on the request row.
  const passes: { fields: TemplateField[]; values: Record<string, string>; imageKey: string }[] =
    signedSigners.length > 0
      ? signedSigners.map((r) => ({
          fields: allFields.filter((f) => f.recipientKey === r.recipientKey),
          values: (r.fieldValues ?? {}) as Record<string, string>,
          imageKey: r.signatureImageKey!,
        }))
      : [
          {
            fields: allFields,
            values: (req.fieldValues ?? {}) as Record<string, string>,
            imageKey: req.signatureImageKey!,
          },
        ];

  let signedPdf = sourcePdf;
  for (const pass of passes) {
    signedPdf = await stampPdf({
      pdfBytes: signedPdf,
      fields: pass.fields,
      fieldValues: pass.values,
      signaturePng: await getObject(pass.imageKey),
    });
  }

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

  // The conditional UPDATE is the claim, and its COUNT is the verdict: exactly
  // one run may record the artifacts. A racing duplicate stamps different bytes
  // (a fresh PDF save differs), so if it also emailed, the two parties could
  // hold documents whose hashes don't match the one seal on file. The loser
  // therefore stops here and emails nothing — the winner's copy is the record.
  const { count } = await runInTenant(tenant, (tx) =>
    tx.signatureRequest.updateMany({
      where: { id: req.id, signedPdfKey: null },
      data: { signedPdfKey, certificateKey, documentHash, sealSignature, sealKid },
    }),
  );
  if (count !== 1) return;

  // 6. Deliver. Sending is last: a mail failure must never roll back a
  // completed, sealed signature — the retry re-sends only.
  await deliver(tenant, req, signedPdf, certificatePdf);
}

interface DeliverableRequest {
  id: string;
  documentName: string;
  recipientName: string | null;
  recipientEmail: string;
  senderEmail: string | null;
}

/**
 * Email both parties their copy, then record that we did. The flag is written
 * only AFTER both sends succeed, so a crash mid-delivery retries rather than
 * silently reporting success — and `completionEmailedAt: null` in the WHERE
 * keeps a duplicate run from double-marking.
 */
async function deliver(
  tenant: string,
  req: DeliverableRequest,
  signedPdf: Buffer,
  certificatePdf: Buffer,
): Promise<void> {
  const attachments = [
    { filename: safeName(req.documentName), content: signedPdf },
    { filename: 'certificate-of-completion.pdf', content: certificatePdf },
  ];
  // Everyone on the envelope gets the finished pair — signers AND cc — plus
  // the sender. Deduplicated so one person on twice isn't emailed twice.
  const audience = await runInTenant(tenant, (tx) =>
    tx.recipient.findMany({ where: { requestId: req.id }, select: { email: true, name: true } }),
  );
  const seen = new Set<string>();
  for (const person of audience.length > 0 ? audience : [{ email: req.recipientEmail, name: req.recipientName }]) {
    const key = person.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    await email.send({
      ...buildSignedCopyEmail({
        documentName: req.documentName,
        recipientName: person.name,
        isSender: false,
      }),
      to: person.email,
      attachments,
    });
  }
  if (req.senderEmail && !seen.has(req.senderEmail.toLowerCase())) {
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
  await runInTenant(tenant, (tx) =>
    tx.signatureRequest.updateMany({
      where: { id: req.id, completionEmailedAt: null },
      data: { completionEmailedAt: new Date() },
    }),
  );
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
