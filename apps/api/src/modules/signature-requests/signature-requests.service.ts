import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { mintSigningToken } from '@docflow/crypto';
import type { SendRequest, SignatureStatus } from '@docflow/contracts';
import { env } from '../../config/env.js';
import { INVITE_JOB, type SigningInviteJob } from '../../queue/jobs.js';
import { QueueService } from '../../queue/queue.service.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import { TenantDb } from '../../tenant/tenant-db.js';

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

@Injectable()
export class SignatureRequestsService {
  constructor(
    private readonly db: TenantDb,
    private readonly context: TenantContext,
    private readonly queue: QueueService,
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
    await this.queue.enqueue(INVITE_JOB, { ...job }, `invite:${row.id}`, {
      removeOnComplete: true,
      removeOnFail: true,
    });

    return toWire(row);
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
