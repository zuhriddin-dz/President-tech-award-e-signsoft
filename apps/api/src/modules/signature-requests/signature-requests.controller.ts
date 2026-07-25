import { Body, Controller, Get, Post } from '@nestjs/common';
import { SendRequestSchema, type SendRequest } from '@docflow/contracts';
import { Policy } from '../../common/policy.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import {
  SignatureRequestsService,
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
}
