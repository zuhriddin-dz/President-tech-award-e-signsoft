import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { SealService, mintSigningToken } from '@docflow/crypto';
import type { SendRequest, SignatureStatus, VerifyResult } from '@docflow/contracts';
import { StorageService } from '../../storage/storage.service.js';
import { env } from '../../config/env.js';
import { INVITE_JOB, type SigningInviteJob } from '../../queue/jobs.js';
import { QueueService } from '../../queue/queue.service.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import { TenantDb } from '../../tenant/tenant-db.js';

/** Ceiling on what verify() will stream-hash — well above any real document. */
const MAX_VERIFY_BYTES = 64 * 1024 * 1024;

export interface SignatureRequestWire {
  id: string;
  documentName: string;
  recipientEmail: string;
  recipientName: string | null;
  status: SignatureStatus;
  sentAt: string;
  viewedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
}

export interface SignatureRequestDetailWire extends SignatureRequestWire {
  senderEmail: string | null;
  consentAt: string | null;
  signatureMethod: string | null;
  viewedIp: string | null;
  viewedUserAgent: string | null;
  signerIp: string | null;
  signerUserAgent: string | null;
  documentHash: string | null;
  sealKid: string | null;
  hasSignedPdf: boolean;
  hasCertificate: boolean;
}

@Injectable()
export class SignatureRequestsService {
  private readonly logger = new Logger(SignatureRequestsService.name);

  constructor(
    private readonly db: TenantDb,
    private readonly context: TenantContext,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
    private readonly seal: SealService,
  ) {}

  /** Create a request from a template + recipient, mint a token, queue the invite. */
  async send(input: SendRequest, senderName: string | null): Promise<SignatureRequestWire> {
    const auth = this.context.requireAuth();

    // Snapshot the template AS IT IS NOW — later edits never touch this request.
    const template = await this.db.tx((tx) =>
      tx.template.findUnique({
        where: { id: input.templateId },
        select: { documentId: true, name: true, fields: true },
      }),
    );
    if (!template) throw new NotFoundException();
    const fields = template.fields as unknown[];
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new BadRequestException('template has no fields to sign');
    }

    // The raw token exists only here; only its hash is persisted.
    const { token, sha256 } = mintSigningToken();
    const expiresAt = new Date(Date.now() + env.ESIGN_LINK_TTL_DAYS * 86_400_000);

    const row = await this.db.tx((tx) =>
      tx.signatureRequest.create({
        data: {
          templateId: input.templateId,
          documentId: template.documentId,
          documentName: template.name,
          fields: template.fields ?? [],
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName ?? null,
          senderEmail: senderName,
          signingTokenHash: sha256,
          createdByUserId: auth.userId,
          expiresAt,
        },
      }),
    );

    // Off the request path: the invite email is a retryable job. The raw token
    // rides in the payload (Redis, our trusted infra) inside the sign URL;
    // removeOnComplete/Fail keep it from lingering after the job resolves.
    const job: SigningInviteJob = {
      to: input.recipientEmail,
      recipientName: input.recipientName ?? null,
      documentName: template.name,
      senderName,
      signUrl: `${env.SIGN_APP_URL}/sign/${token}`,
    };
    // Hyphen, not colon — BullMQ custom job ids may not contain ':'.
    try {
      await this.queue.enqueue(INVITE_JOB, { ...job }, `invite-${row.id}`, {
        removeOnComplete: true,
        removeOnFail: true,
      });
    } catch (cause) {
      // The invite is the whole point of a send. If it cannot be queued (Redis
      // down/unreachable), roll the request back rather than leaving a phantom
      // "waiting for signature" row whose email will never arrive — the
      // dashboard must never claim something we didn't do.
      await this.db.tx((tx) => tx.signatureRequest.deleteMany({ where: { id: row.id } }));
      this.logger.error(`invite enqueue failed for ${row.id}: ${(cause as Error).message}`);
      throw new ServiceUnavailableException(
        'Could not send right now — the background service is unavailable. Please try again.',
      );
    }

    return toWire(row);
  }

  /** The full audit record for one request (RLS-scoped; foreign id → 404). */
  async detail(id: string): Promise<SignatureRequestDetailWire> {
    const row = await this.db.tx((tx) => tx.signatureRequest.findUnique({ where: { id } }));
    if (!row) throw new NotFoundException();
    return {
      ...toWire(row),
      senderEmail: row.senderEmail,
      consentAt: row.consentAt?.toISOString() ?? null,
      signatureMethod: row.signatureMethod,
      viewedIp: row.viewedIp,
      viewedUserAgent: row.viewedUserAgent,
      signerIp: row.signerIp,
      signerUserAgent: row.signerUserAgent,
      documentHash: row.documentHash,
      sealKid: row.sealKid,
      hasSignedPdf: Boolean(row.signedPdfKey),
      hasCertificate: Boolean(row.certificateKey),
    };
  }

  /** Stream the sealed artifacts to the sender (same-origin, never a presigned URL). */
  async readArtifact(
    id: string,
    which: 'signed' | 'certificate',
  ): Promise<{ stream: Readable; size?: number; filename: string }> {
    const row = await this.db.tx((tx) => tx.signatureRequest.findUnique({ where: { id } }));
    if (!row) throw new NotFoundException();
    const key = which === 'signed' ? row.signedPdfKey : row.certificateKey;
    if (!key) throw new NotFoundException();
    const { stream, byteLength: size } = await this.storage.getStream(key);
    const base = row.documentName.replace(/[^A-Za-z0-9 ._-]/g, '').trim() || 'document';
    const filename =
      which === 'signed'
        ? base.toLowerCase().endsWith('.pdf')
          ? base
          : `${base}.pdf`
        : 'certificate-of-completion.pdf';
    return { stream, size, filename };
  }

  /**
   * The tamper check. Re-reads the STORED signed PDF, re-hashes it, and
   * verifies the seal — so it proves two separate things: the bytes are the
   * ones that were signed (hash), and this server sealed them for THIS request
   * at THAT time (signature). Either failing makes the result invalid.
   */
  async verify(id: string): Promise<VerifyResult> {
    const row = await this.db.tx((tx) => tx.signatureRequest.findUnique({ where: { id } }));
    if (!row) throw new NotFoundException();
    const checkedAt = new Date().toISOString();
    if (!row.signedPdfKey || !row.documentHash || !row.sealSignature || !row.sealKid || !row.completedAt) {
      // Not sealed yet (or never signed) — not a failure, just nothing to verify.
      return {
        valid: false,
        computedHash: null,
        recordedHash: row.documentHash,
        hashMatches: false,
        sealValid: false,
        sealKid: row.sealKid,
        checkedAt,
      };
    }

    // Hash the stored bytes as they STREAM — never buffer the whole file.
    // Buffering here let any viewer pin an arbitrarily large object in the
    // shared API process (an OOM lever affecting every tenant); a running
    // digest is constant-memory, and the cap stops a pathological object.
    const { stream } = await this.storage.getStream(row.signedPdfKey);
    const digest = createHash('sha256');
    let read = 0;
    try {
      for await (const chunk of stream) {
        read += (chunk as Buffer).length;
        if (read > MAX_VERIFY_BYTES) {
          stream.destroy();
          throw new PayloadTooLargeException('stored document is too large to verify');
        }
        digest.update(chunk as Buffer);
      }
    } finally {
      stream.destroy();
    }
    const computedHash = digest.digest('hex');

    const hashMatches = computedHash === row.documentHash;
    const sealValid = this.seal.verify(
      { requestId: row.id, signedAt: row.completedAt, documentHash: computedHash },
      row.sealSignature,
      row.sealKid,
    );
    return {
      valid: hashMatches && sealValid,
      computedHash,
      recordedHash: row.documentHash,
      hashMatches,
      sealValid,
      sealKid: row.sealKid,
      checkedAt,
    };
  }

  async list(): Promise<SignatureRequestWire[]> {
    const rows = await this.db.tx((tx) =>
      tx.signatureRequest.findMany({ orderBy: { sentAt: 'desc' }, take: 200 }),
    );
    return rows.map(toWire);
  }
}

function toWire(row: {
  id: string;
  documentName: string;
  recipientEmail: string;
  recipientName: string | null;
  status: string;
  sentAt: Date;
  viewedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
}): SignatureRequestWire {
  return {
    id: row.id,
    documentName: row.documentName,
    recipientEmail: row.recipientEmail,
    recipientName: row.recipientName,
    status: row.status as SignatureStatus,
    sentAt: row.sentAt.toISOString(),
    viewedAt: row.viewedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}
