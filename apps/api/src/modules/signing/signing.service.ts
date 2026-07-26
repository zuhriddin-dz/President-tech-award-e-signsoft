import type { Readable } from 'node:stream';
import { Injectable, NotFoundException } from '@nestjs/common';
import { decodeSignaturePng } from '@docflow/crypto';
import type { SignerView, SubmitSignature, TemplateField } from '@docflow/contracts';
import { COMPLETE_JOB, type CompleteSignatureJob } from '../../queue/jobs.js';
import { QueueService } from '../../queue/queue.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { SigningTokenResolver } from '../../tenant/signing-token.resolver.js';
import { TenantDb } from '../../tenant/tenant-db.js';

// The one failure shape for the whole public surface — bad token, wrong hash,
// expired, voided, already-claimed: all this, never anything more specific.
function notValid(): never {
  throw new NotFoundException('This signing link is not valid.');
}

interface LoadedRequest {
  id: string;
  documentId: string;
  documentName: string;
  fields: TemplateField[];
  recipientName: string | null;
  recipientEmail: string;
  status: string;
  expiresAt: Date;
  consentAt: Date | null;
  signingTokenHash: string;
}

@Injectable()
export class SigningService {
  constructor(
    private readonly resolver: SigningTokenResolver,
    private readonly db: TenantDb,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Resolve the token, enter tenant context, and load the request under RLS
   * with the mandatory re-check: the presented hash must equal the stored one,
   * the request must not be voided or expired. Every failure is the same 404.
   */
  private async loadForToken(rawToken: string): Promise<LoadedRequest> {
    const resolved = await this.resolver.resolve(rawToken);
    if (!resolved) notValid();
    const row = await this.db.tx((tx) =>
      tx.signatureRequest.findUnique({ where: { id: resolved.requestId } }),
    );
    // Re-check BY the hash (keyed compare, not a string compare) + state.
    if (!row || row.signingTokenHash !== resolved.tokenHash) notValid();
    if (row.status === 'voided') notValid();
    if (row.expiresAt.getTime() <= Date.now()) notValid();
    return {
      id: row.id,
      documentId: row.documentId,
      documentName: row.documentName,
      fields: row.fields as TemplateField[],
      recipientName: row.recipientName,
      recipientEmail: row.recipientEmail,
      status: row.status,
      expiresAt: row.expiresAt,
      consentAt: row.consentAt,
      signingTokenHash: row.signingTokenHash,
    };
  }

  /** Record consent to sign electronically — before any field is filled. */
  async consent(rawToken: string): Promise<{ ok: true }> {
    const req = await this.loadForToken(rawToken);
    if (req.status !== 'sent' && req.status !== 'viewed') notValid();
    if (!req.consentAt) {
      await this.db.tx((tx) =>
        tx.signatureRequest.updateMany({
          where: { id: req.id, status: { in: ['sent', 'viewed'] } },
          data: { consentAt: new Date() },
        }),
      );
    }
    return { ok: true };
  }

  /** Render data for the ceremony; records the first view (audit) idempotently. */
  async view(rawToken: string, ip: string | null, ua: string | null): Promise<SignerView> {
    const req = await this.loadForToken(rawToken);

    // Record first view only while still pending — never overwrite later.
    if (req.status === 'sent') {
      await this.db.tx((tx) =>
        tx.signatureRequest.updateMany({
          where: { id: req.id, status: 'sent' },
          data: { status: 'viewed', viewedAt: new Date(), signerIp: ip, signerUserAgent: ua },
        }),
      );
    }

    // Page geometry comes from the source document's template snapshot; the
    // fields carry page numbers, and the sign app fetches the PDF for sizing.
    const doc = await this.db.tx((tx) =>
      tx.document.findUnique({
        where: { id: req.documentId },
        select: {
          templates: { select: { pageCount: true, pageSizes: true }, take: 1 },
        },
      }),
    );
    const tpl = doc?.templates[0];

    return {
      documentName: req.documentName,
      recipientName: req.recipientName,
      signerEmail: req.recipientEmail,
      pageCount: tpl?.pageCount ?? 1,
      pageSizes: (tpl?.pageSizes as { w: number; h: number }[]) ?? [],
      fields: req.fields,
      status: req.status as SignerView['status'],
      consentAt: req.consentAt?.toISOString() ?? null,
      completed: req.status === 'completed',
    };
  }

  /** Stream the source PDF bytes for the ceremony viewer. */
  async readDocument(rawToken: string): Promise<{ stream: Readable; size?: number }> {
    const req = await this.loadForToken(rawToken);
    const doc = await this.db.tx((tx) =>
      tx.document.findUnique({ where: { id: req.documentId }, select: { storageKey: true } }),
    );
    if (!doc) notValid();
    return this.storage.getStream(doc.storageKey);
  }

  /**
   * Submit: validate the PNG, store it, then ATOMICALLY claim the request
   * (single-use). The claim is a conditional UPDATE — two concurrent submits
   * race it in the DB and exactly one gets count === 1; the loser gets the same
   * 404 an expired link gets. The heavy stamp→seal→certificate→email runs as a
   * Phase-10 job, enqueued idempotently by request id.
   */
  async submit(
    rawToken: string,
    dto: SubmitSignature,
    ip: string | null,
    ua: string | null,
  ): Promise<{ ok: true }> {
    const req = await this.loadForToken(rawToken);
    if (req.status !== 'sent' && req.status !== 'viewed') notValid();
    // Consent must have been recorded first — the evidence never claims a
    // signature that predates consent.
    if (!req.consentAt) notValid();

    const png = decodeSignaturePng(dto.signatureImage);
    if (!png) notValid();

    // Bytes land in storage first; a crash before the claim leaves an orphan
    // object (lifecycle-swept), never a claimed request with no signature.
    const signatureKey = this.storage.newKey('signatures');
    await this.storage.put(signatureKey, png, 'image/png');

    const now = new Date();
    const { count } = await this.db.tx((tx) =>
      tx.signatureRequest.updateMany({
        // The WHERE is the check: only a still-signable row with THIS token flips.
        where: {
          id: req.id,
          signingTokenHash: req.signingTokenHash,
          status: { in: ['sent', 'viewed'] },
        },
        data: {
          status: 'completed',
          completedAt: now,
          signatureMethod: dto.method,
          signatureImageKey: signatureKey,
          fieldValues: dto.fieldValues,
          signerIp: ip,
          signerUserAgent: ua,
        },
      }),
    );
    // Lost the race (or already done/expired): uniform 404. The orphaned PNG
    // is harmless and lifecycle-swept.
    if (count !== 1) notValid();

    // Phase 10 performs stamp → hash → seal → certificate → email, idempotent
    // by request id. (Processor is a stub until Phase 10.)
    const job: CompleteSignatureJob = { requestId: req.id };
    await this.queue.enqueue(COMPLETE_JOB, { ...job }, `complete-${req.id}`);

    return { ok: true };
  }
}
