import type { Readable } from 'node:stream';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { decodeSignaturePng } from '@docflow/crypto';
import { resolveFieldValues } from './field-values.js';
import type { SignerView, SubmitSignature, TemplateField } from '@docflow/contracts';
import { COMPLETE_JOB, type CompleteSignatureJob } from '../../queue/jobs.js';
import { QueueService } from '../../queue/queue.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { SigningTokenResolver } from '../../tenant/signing-token.resolver.js';
import { TenantContext } from '../../tenant/tenant-context.js';
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
  private readonly logger = new Logger(SigningService.name);

  constructor(
    private readonly resolver: SigningTokenResolver,
    private readonly db: TenantDb,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly context: TenantContext,
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
    // Only a still-signable request resolves — a completed/voided/expired link
    // is dead everywhere (view, document, consent, submit), the uniform 404.
    // This closes the "source PDF still fetchable after completion" leak.
    if (!row || row.signingTokenHash !== resolved.tokenHash) notValid();
    if (row.status !== 'sent' && row.status !== 'viewed') notValid();
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
          // consentAt:null in the WHERE so two concurrent consent calls don't
          // both write — the first-consent timestamp is the evidentiary one.
          where: { id: req.id, status: { in: ['sent', 'viewed'] }, consentAt: null },
          data: { consentAt: new Date() },
        }),
      );
    }
    return { ok: true };
  }

  /** Render data for the ceremony; records the first view (audit) idempotently. */
  async view(rawToken: string, ip: string | null, ua: string | null): Promise<SignerView> {
    const req = await this.loadForToken(rawToken);

    // Record first view only while still pending — never overwrite later. The
    // first-view IP/UA go to viewedIp/viewedUserAgent; the sign-time IP/UA are
    // recorded separately at submit(), so the pairing survives.
    if (req.status === 'sent') {
      await this.db.tx((tx) =>
        tx.signatureRequest.updateMany({
          where: { id: req.id, status: 'sent' },
          data: { status: 'viewed', viewedAt: new Date(), viewedIp: ip, viewedUserAgent: ua },
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

  /**
   * Post-completion status for the ceremony's download step.
   *
   * Deliberately does NOT use loadForToken (which fails a completed request):
   * once signing succeeds the signer still needs their copy, so a consumed
   * token keeps exactly this one capability — read your own signed artifacts —
   * and nothing else. Expiry still applies, so the window is bounded.
   */
  async completedStatus(rawToken: string): Promise<{ ready: boolean; documentName: string }> {
    const req = await this.loadCompleted(rawToken);
    return { ready: Boolean(req.signedPdfKey), documentName: req.documentName };
  }

  /** Stream the signer's signed copy (or certificate) once the pipeline is done. */
  async readCompleted(
    rawToken: string,
    which: 'signed' | 'certificate',
  ): Promise<{ stream: Readable; size?: number; filename: string }> {
    const req = await this.loadCompleted(rawToken);
    const key = which === 'signed' ? req.signedPdfKey : req.certificateKey;
    // Not ready yet is the same 404 as never — the client polls status first.
    if (!key) notValid();
    const { stream, byteLength: size } = await this.storage.getStream(key);
    const base = req.documentName.replace(/[^A-Za-z0-9 ._-]/g, '').trim() || 'document';
    const filename =
      which === 'signed'
        ? base.toLowerCase().endsWith('.pdf')
          ? base
          : `${base}.pdf`
        : 'certificate-of-completion.pdf';
    return { stream, size, filename };
  }

  /** Resolve a token whose request is COMPLETED (the only post-signing door). */
  private async loadCompleted(rawToken: string): Promise<{
    documentName: string;
    signedPdfKey: string | null;
    certificateKey: string | null;
  }> {
    const resolved = await this.resolver.resolve(rawToken);
    if (!resolved) notValid();
    const row = await this.db.tx((tx) =>
      tx.signatureRequest.findUnique({ where: { id: resolved.requestId } }),
    );
    if (!row || row.signingTokenHash !== resolved.tokenHash) notValid();
    if (row.status !== 'completed') notValid();
    if (row.expiresAt.getTime() <= Date.now()) notValid();
    return {
      documentName: row.documentName,
      signedPdfKey: row.signedPdfKey,
      certificateKey: row.certificateKey,
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

    const now = new Date();
    // The signer does NOT get to author the date/name/email that end up in the
    // sealed document — those are computed here from the request row. Client
    // values survive only for genuinely free-form inputs, and only for fields
    // the snapshot knows. Required inputs must be filled.
    const resolved = resolveFieldValues(req.fields, dto.fieldValues, {
      recipientName: req.recipientName,
      recipientEmail: req.recipientEmail,
      signedAt: now,
    });
    if (resolved.missingRequired.length > 0) notValid();

    // Bytes land in storage first; a crash before the claim leaves an orphan
    // object (lifecycle-swept), never a claimed request with no signature.
    const signatureKey = this.storage.newKey('signatures');
    await this.storage.put(signatureKey, png, 'image/png');

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
          fieldValues: resolved.values,
          signerIp: ip,
          signerUserAgent: ua,
        },
      }),
    );
    // Lost the race (or already done/expired): uniform 404. The orphaned PNG
    // is harmless and lifecycle-swept.
    if (count !== 1) notValid();

    // stamp → hash → seal → certificate → email, off the request path and
    // idempotent by request id. The tenant travels in the payload because a
    // worker has no request context; it is read from the row we just verified,
    // never from client input.
    // The tenant comes from the context the token resolution entered — the
    // same verified source RLS itself uses, never a client value.
    const job: CompleteSignatureJob = {
      requestId: req.id,
      tenant: this.context.requireAuth().tenantId,
    };
    try {
      await this.queue.enqueue(COMPLETE_JOB, { ...job }, `complete-${req.id}`);
    } catch (cause) {
      // The signature is ALREADY committed and legally complete — failing the
      // signer here would be a lie, and rolling back would destroy real
      // evidence. So we swallow the enqueue failure and let the reconciler
      // (worker) pick the request up: it sweeps completed rows that have no
      // sealed artifacts. The ceremony's "preparing your copy" state covers
      // the delay.
      this.logger.error(
        `completion enqueue failed for ${req.id} — left for the reconciler: ${(cause as Error).message}`,
      );
    }

    return { ok: true };
  }
}
