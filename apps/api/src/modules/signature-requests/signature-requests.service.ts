import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { SealService, mintSigningToken } from '@docflow/crypto';
import type {
  RecipientRole,
  RecipientStatus,
  RoutingMode,
  SendRequest,
  SignatureStatus,
  VerifyResult,
} from '@docflow/contracts';
import { StorageService } from '../../storage/storage.service.js';
import { env } from '../../config/env.js';
import { EMAIL_JOB, INVITE_JOB, type SendEmailJob, type SigningInviteJob } from '../../queue/jobs.js';
import { buildSigningInviteEmail } from '../../email/signing-invite-email.js';
import { buildVoidedEmail } from '../../email/lifecycle-emails.js';
import { QueueService } from '../../queue/queue.service.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import { TenantDb } from '../../tenant/tenant-db.js';

/** Ceiling on what verify() will stream-hash — well above any real document. */
const MAX_VERIFY_BYTES = 64 * 1024 * 1024;

/**
 * A short, id-safe token for an email address, used only to build a
 * deterministic BullMQ job id (which may not contain ':' — and an email may).
 * Not a security boundary; just a stable per-recipient suffix.
 */
function hashEmailForKey(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
}

export interface SignatureRequestWire {
  id: string;
  documentName: string;
  recipientEmail: string;
  recipientName: string | null;
  routingMode: RoutingMode;
  signedCount: number;
  signerCount: number;
  status: SignatureStatus;
  sentAt: string;
  viewedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  lastChangeAt: string;
  waitingOn: string | null;
  senderEmail: string | null;
  folderId: string | null;
  folderName: string | null;
  deletedAt: string | null;
  hasSignedPdf: boolean;
}

export interface RecipientWire {
  id: string;
  email: string;
  name: string | null;
  role: RecipientRole;
  routingOrder: number;
  status: RecipientStatus;
  sentAt: string | null;
  viewedAt: string | null;
  completedAt: string | null;
  signerIp: string | null;
}

export interface SignatureRequestDetailWire extends SignatureRequestWire {
  recipients: RecipientWire[];
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

    const expiresAt = new Date(Date.now() + env.ESIGN_LINK_TTL_DAYS * 86_400_000);
    const firstSigner =
      input.recipients.find((r) => r.role === 'signer') ?? input.recipients[0]!;

    // Everyone in the first routing group is invited now; in sequential mode
    // later groups stay `pending` until the group before them finishes.
    const firstOrder = Math.min(...input.recipients.map((r) => r.routingOrder));
    const invitedNow = (r: { routingOrder: number }) =>
      input.routingMode === 'parallel' || r.routingOrder === firstOrder;

    // Mint a token per recipient we're inviting; raw values exist only here.
    const tokens = new Map<string, { token: string; sha256: string }>();
    for (const r of input.recipients) {
      if (invitedNow(r) && r.role === 'signer') tokens.set(r.email, mintSigningToken());
    }

    const row = await this.db.tx(async (tx) => {
      const created = await tx.signatureRequest.create({
        data: {
          templateId: input.templateId,
          documentId: template.documentId,
          documentName: template.name,
          fields: template.fields ?? [],
          routingMode: input.routingMode,
          recipientEmail: firstSigner.email,
          recipientName: firstSigner.name ?? null,
          senderEmail: senderName,
          emailSubject: input.subject?.trim() || null,
          emailMessage: input.message?.trim() || null,
          createdByUserId: auth.userId,
          expiresAt,
        },
      });
      await tx.recipient.createMany({
        data: input.recipients.map((r) => ({
          requestId: created.id,
          email: r.email,
          name: r.name ?? null,
          role: r.role,
          routingOrder: r.routingOrder,
          recipientKey: r.recipientKey,
          status: invitedNow(r) && r.role === 'signer' ? 'sent' : 'pending',
          signingTokenHash: tokens.get(r.email)?.sha256 ?? null,
          sentAt: invitedNow(r) && r.role === 'signer' ? new Date() : null,
        })),
      });
      // "Last used" is about SENDING, not editing — so the favourites shelf
      // ranks by what the sender actually puts to work.
      await tx.template.updateMany({
        where: { id: input.templateId },
        data: { lastUsedAt: new Date() },
      });
      return created;
    });

    // Off the request path: the invite email is a retryable job. The raw token
    // rides in the payload (Redis, our trusted infra) inside the sign URL;
    // removeOnComplete/Fail keep it from lingering after the job resolves.
    // One invite per signer in the first group. Hyphen, not colon — BullMQ
    // custom job ids may not contain ':'.
    try {
      for (const r of input.recipients) {
        const minted = tokens.get(r.email);
        if (!minted) continue; // cc, or a later routing group
        const job: SigningInviteJob = {
          to: r.email,
          recipientName: r.name ?? null,
          documentName: template.name,
          senderName,
          signUrl: `${env.SIGN_APP_URL}/sign/${minted.token}`,
          subject: input.subject?.trim() || null,
          message: input.message?.trim() || null,
        };
        await this.queue.enqueue(
          INVITE_JOB,
          { ...job },
          `invite-${row.id}-${hashEmailForKey(r.email)}`,
          { removeOnComplete: true, removeOnFail: true },
        );
      }
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

    const withRecipients = await this.db.tx((tx) =>
      tx.signatureRequest.findUnique({ where: { id: row.id }, include: { recipients: true } }),
    );
    return toWire(withRecipients ?? { ...row, recipients: [] });
  }

  /**
   * Cancel an envelope. Every outstanding signing token is destroyed (not just
   * marked — the hash is cleared, so the link resolves to nothing), and anyone
   * who hadn't finished is told. A completed envelope cannot be voided: its
   * signatures are real and the evidence must stand.
   */
  async void(id: string, reason: string | null): Promise<{ ok: true }> {
    const outstanding = await this.db.tx(async (tx) => {
      const row = await tx.signatureRequest.findUnique({
        where: { id },
        include: { recipients: true },
      });
      if (!row) throw new NotFoundException();
      if (row.status === 'completed') {
        throw new ConflictException('This document is already signed and cannot be cancelled.');
      }
      if (row.status === 'voided') return { people: [], documentName: row.documentName };

      const now = new Date();
      await tx.signatureRequest.updateMany({
        where: { id, status: { in: ['sent', 'viewed', 'expired'] } },
        data: { status: 'voided', voidedAt: now },
      });
      // Clearing the hash is what actually kills the links: resolution is a
      // lookup BY hash, so a token with no row resolves to nothing.
      await tx.recipient.updateMany({
        where: { requestId: id, status: { in: ['pending', 'sent', 'viewed'] } },
        data: { signingTokenHash: null },
      });
      return {
        people: row.recipients.filter((r) => r.status !== 'completed'),
        documentName: row.documentName,
      };
    });

    for (const r of outstanding.people) {
      await this.notify(
        buildVoidedEmail({
          to: r.email,
          recipientName: r.name,
          documentName: outstanding.documentName,
          reason,
        }),
        `void-${r.id}`,
      );
    }
    return { ok: true };
  }

  /**
   * Re-issue one recipient's link. A NEW token is minted and the old one dies
   * immediately — so a link forwarded to the wrong person, or lost in a spam
   * folder, can be replaced without cancelling the whole envelope.
   */
  async resend(id: string, recipientId: string): Promise<{ ok: true }> {
    const { recipient, documentName, token, subject, message } = await this.db.tx(async (tx) => {
      const row = await tx.signatureRequest.findUnique({ where: { id } });
      if (!row) throw new NotFoundException();
      if (row.status !== 'sent' && row.status !== 'viewed') {
        throw new ConflictException('This document is no longer awaiting signatures.');
      }
      const rc = await tx.recipient.findUnique({ where: { id: recipientId } });
      if (!rc || rc.requestId !== id) throw new NotFoundException();
      if (rc.role !== 'signer') throw new ConflictException('That recipient does not sign.');
      if (rc.status === 'completed') throw new ConflictException('They have already signed.');
      if (rc.status === 'pending') {
        throw new ConflictException("It is not this person's turn yet.");
      }

      const minted = mintSigningToken();
      await tx.recipient.updateMany({
        where: { id: recipientId },
        data: { signingTokenHash: minted.sha256, sentAt: new Date(), status: 'sent' },
      });
      return {
        recipient: rc,
        documentName: row.documentName,
        token: minted.token,
        subject: row.emailSubject,
        message: row.emailMessage,
      };
    });

    await this.notify(
      buildSigningInviteEmail({
        to: recipient.email,
        recipientName: recipient.name,
        documentName,
        senderName: null,
        signUrl: `${env.SIGN_APP_URL}/sign/${token}`,
        subject,
        message,
      }),
      // Time-suffixed: a resend is a NEW delivery, not a duplicate of the
      // original invite, so it must not be deduplicated away.
      `resend-${recipientId}-${Date.now()}`,
    );
    return { ok: true };
  }

  /** Nudge one recipient using their EXISTING link (no new token). */
  async remind(id: string, recipientId: string): Promise<{ ok: true }> {
    const row = await this.db.tx((tx) => tx.signatureRequest.findUnique({ where: { id } }));
    if (!row) throw new NotFoundException();
    if (row.status !== 'sent' && row.status !== 'viewed') {
      throw new ConflictException('This document is no longer awaiting signatures.');
    }
    const rc = await this.db.tx((tx) => tx.recipient.findUnique({ where: { id: recipientId } }));
    if (!rc || rc.requestId !== id) throw new NotFoundException();
    if (rc.status === 'completed') throw new ConflictException('They have already signed.');
    if (!rc.signingTokenHash) {
      // No live token to point at — the honest action is Resend, not Remind.
      throw new ConflictException('That recipient has no active link; use Resend instead.');
    }

    // We only hold the HASH, so a reminder cannot contain the original link.
    // Re-issuing is the only way to send a working URL — which is exactly what
    // resend() is for. A manual reminder therefore rotates the token too.
    return this.resend(id, recipientId);
  }

  /**
   * Queue one already-composed email. Sending stays off the request path, and
   * a failure here never fails the action that triggered it — cancelling a
   * document must succeed even if the courtesy email cannot go out.
   */
  private async notify(message: SendEmailJob, key: string): Promise<void> {
    try {
      await this.queue.enqueue(EMAIL_JOB, { ...message }, key, {
        removeOnComplete: true,
        removeOnFail: true,
      });
    } catch (cause) {
      this.logger.error(`lifecycle email "${key}" could not be queued: ${(cause as Error).message}`);
    }
  }

  /** The full audit record for one request (RLS-scoped; foreign id → 404). */
  async detail(id: string): Promise<SignatureRequestDetailWire> {
    const row = await this.db.tx((tx) =>
      tx.signatureRequest.findUnique({
        where: { id },
        include: {
          recipients: { orderBy: { routingOrder: 'asc' } },
          folder: { select: { name: true } },
        },
      }),
    );
    if (!row) throw new NotFoundException();
    return {
      ...toWire(row),
      recipients: row.recipients.map(recipientToWire),
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
   * One recipient's adopted signature image, for the sender's evidence view.
   * Scoped through the request row (RLS) and matched on requestId, so a
   * recipient id from another envelope cannot be read through this path.
   */
  async readSignatureImage(
    id: string,
    recipientId: string,
  ): Promise<{ stream: Readable; size?: number }> {
    const rc = await this.db.tx(async (tx) => {
      const row = await tx.signatureRequest.findUnique({ where: { id }, select: { id: true } });
      if (!row) throw new NotFoundException();
      return tx.recipient.findUnique({ where: { id: recipientId } });
    });
    if (!rc || rc.requestId !== id || !rc.signatureImageKey) throw new NotFoundException();
    const { stream, byteLength: size } = await this.storage.getStream(rc.signatureImageKey);
    return { stream, size };
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

  /**
   * Every envelope the caller's workspace can see, newest movement first.
   * Deleted rows come along too — the quick views filter client-side, and the
   * Deleted view needs them. RLS is what scopes this, not any parameter here.
   */
  async list(): Promise<SignatureRequestWire[]> {
    const rows = await this.db.tx((tx) =>
      tx.signatureRequest.findMany({
        orderBy: { sentAt: 'desc' },
        take: 500,
        include: { recipients: true, folder: { select: { name: true } } },
      }),
    );
    return rows.map(toWire);
  }

  // ── Organisation: folders, filing, soft delete ───────────────────────────

  async listFolders(): Promise<{ id: string; name: string; createdAt: string; count: number }[]> {
    const rows = await this.db.tx((tx) =>
      tx.folder.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { requests: { where: { deletedAt: null } } } } },
      }),
    );
    return rows.map((f) => ({
      id: f.id,
      name: f.name,
      createdAt: f.createdAt.toISOString(),
      count: f._count.requests,
    }));
  }

  async createFolder(name: string): Promise<{ id: string; name: string; createdAt: string; count: number }> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('a folder needs a name');
    const row = await this.db.tx((tx) => tx.folder.create({ data: { name: trimmed } }));
    return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString(), count: 0 };
  }

  /**
   * File (or unfile) envelopes. The folder is looked up under RLS first, so a
   * folder id from another workspace is a 404 rather than a silent cross-tenant
   * write — updateMany with a bad foreign key would otherwise fail obscurely.
   */
  async moveToFolder(requestIds: string[], folderId: string | null): Promise<{ moved: number }> {
    const moved = await this.db.tx(async (tx) => {
      if (folderId !== null) {
        const folder = await tx.folder.findUnique({ where: { id: folderId } });
        if (!folder) throw new NotFoundException();
      }
      const res = await tx.signatureRequest.updateMany({
        where: { id: { in: requestIds } },
        data: { folderId },
      });
      return res.count;
    });
    return { moved };
  }

  /**
   * Move envelopes to the Deleted view. This is a SOFT delete on purpose: the
   * signed artifacts and audit trail are evidence, and a sender tidying their
   * inbox must not be able to destroy them.
   */
  async softDelete(requestIds: string[]): Promise<{ deleted: number }> {
    const deleted = await this.db.tx(async (tx) => {
      const res = await tx.signatureRequest.updateMany({
        where: { id: { in: requestIds }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return res.count;
    });
    return { deleted };
  }

  async restore(requestIds: string[]): Promise<{ restored: number }> {
    const restored = await this.db.tx(async (tx) => {
      const res = await tx.signatureRequest.updateMany({
        where: { id: { in: requestIds }, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      return res.count;
    });
    return { restored };
  }
}

interface ToWireRow {
  id: string;
  documentName: string;
  recipientEmail: string;
  recipientName: string | null;
  routingMode: string;
  recipients?: {
    role: string;
    status: string;
    name?: string | null;
    email?: string;
    routingOrder?: number;
  }[];
  status: string;
  sentAt: Date;
  viewedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
  voidedAt?: Date | null;
  deletedAt?: Date | null;
  folderId?: string | null;
  folder?: { name: string } | null;
  signedPdfKey?: string | null;
  senderEmail?: string | null;
}

function toWire(row: ToWireRow): SignatureRequestWire {
  // Progress counts only ever consider SIGNERS — a cc never blocks an envelope
  // and must not make it look unfinished.
  const all = row.recipients ?? [];
  const signers = all.filter((r) => r.role === 'signer');
  const live = row.status === 'sent' || row.status === 'viewed';
  // Who the sender is actually waiting on: the earliest routing group that
  // still has an unfinished signer. In parallel mode that's simply the first
  // outstanding person.
  const outstanding = signers
    .filter((r) => r.status !== 'completed')
    .sort((a, b) => (a.routingOrder ?? 1) - (b.routingOrder ?? 1))[0];

  // "Last Change" is the most recent movement of ANY kind, so a viewed or
  // cancelled envelope doesn't keep showing its send date as if nothing
  // happened since.
  const lastChange = [row.completedAt, row.voidedAt, row.viewedAt, row.sentAt]
    .filter((d): d is Date => d instanceof Date)
    .reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));

  return {
    id: row.id,
    documentName: row.documentName,
    recipientEmail: row.recipientEmail,
    recipientName: row.recipientName,
    routingMode: row.routingMode as RoutingMode,
    signedCount: signers.filter((r) => r.status === 'completed').length,
    signerCount: signers.length,
    status: row.status as SignatureStatus,
    sentAt: row.sentAt.toISOString(),
    viewedAt: row.viewedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    lastChangeAt: lastChange.toISOString(),
    waitingOn: live && outstanding ? (outstanding.name?.trim() || outstanding.email || null) : null,
    senderEmail: row.senderEmail ?? null,
    folderId: row.folderId ?? null,
    folderName: row.folder?.name ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    hasSignedPdf: Boolean(row.signedPdfKey),
  };
}

function recipientToWire(r: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  routingOrder: number;
  status: string;
  sentAt: Date | null;
  viewedAt: Date | null;
  completedAt: Date | null;
  signerIp: string | null;
}): RecipientWire {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role as RecipientRole,
    routingOrder: r.routingOrder,
    status: r.status as RecipientStatus,
    sentAt: r.sentAt?.toISOString() ?? null,
    viewedAt: r.viewedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    signerIp: r.signerIp,
  };
}
