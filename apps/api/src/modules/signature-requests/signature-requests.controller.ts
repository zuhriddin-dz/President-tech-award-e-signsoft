import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import {
  SendRequestSchema,
  VoidRequestSchema,
  type SendRequest,
  type VerifyResult,
} from '@docflow/contracts';
import { Policy } from '../../common/policy.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import {
  SignatureRequestsService,
  type SignatureRequestDetailWire,
  type SignatureRequestWire,
} from './signature-requests.service.js';

@Controller('signature-requests')
export class SignatureRequestsController {
  constructor(
    private readonly requests: SignatureRequestsService,
    private readonly context: TenantContext,
  ) {}

  @Post()
  @Policy('member')
  async send(
    @Body(new ZodValidationPipe(SendRequestSchema)) body: SendRequest,
  ): Promise<SignatureRequestWire> {
    // The sender's display name for the invite — the verified email, if any.
    const senderName = this.context.identity()?.email ?? null;
    return this.requests.send(body, senderName);
  }

  @Get()
  @Policy('viewer')
  async list(): Promise<{ requests: SignatureRequestWire[] }> {
    return { requests: await this.requests.list() };
  }

  @Get(':id')
  @Policy('viewer')
  async detail(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
  ): Promise<SignatureRequestDetailWire> {
    return this.requests.detail(id);
  }

  @Get(':id/signed')
  @Policy('viewer')
  @Header('Cache-Control', 'no-store')
  async signed(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
  ): Promise<StreamableFile> {
    const { stream, size, filename } = await this.requests.readArtifact(id, 'signed');
    return new StreamableFile(stream, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
      length: size,
    });
  }

  @Get(':id/certificate')
  @Policy('viewer')
  @Header('Cache-Control', 'no-store')
  async certificate(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
  ): Promise<StreamableFile> {
    const { stream, size, filename } = await this.requests.readArtifact(id, 'certificate');
    return new StreamableFile(stream, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
      length: size,
    });
  }

  /** Cancel an envelope — every outstanding link dies, everyone is told. */
  @Post(':id/void')
  @Policy('member')
  async void(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const parsed = VoidRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('invalid request');
    return this.requests.void(id, parsed.data.reason ?? null);
  }

  /** Re-issue one recipient's link (the old one dies immediately). */
  @Post(':id/recipients/:recipientId/resend')
  @Policy('member')
  async resend(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Param('recipientId', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) recipientId: string,
  ): Promise<{ ok: true }> {
    return this.requests.resend(id, recipientId);
  }

  /** Nudge one recipient who hasn't signed yet. */
  @Post(':id/recipients/:recipientId/remind')
  @Policy('member')
  async remind(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Param('recipientId', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) recipientId: string,
  ): Promise<{ ok: true }> {
    return this.requests.remind(id, recipientId);
  }

  /** Re-hash the stored signed PDF and check the seal. */
  @Get(':id/verify')
  @Policy('viewer')
  @Header('Cache-Control', 'no-store')
  async verify(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
  ): Promise<VerifyResult> {
    return this.requests.verify(id);
  }
}
