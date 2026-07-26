import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { SubmitSignatureSchema, type SignerView, type SubmitSignature } from '@docflow/contracts';
import { Policy } from '../../common/policy.js';
import { SigningService } from './signing.service.js';

/**
 * The PUBLIC signing surface — everything a /sign/<token> link reaches. One
 * controller, so the whole unauthenticated perimeter is one file. @Policy(
 * 'sign-relay') means: not Clerk — gated by the relay secret (only apps/sign
 * holds it) plus the token itself. Every failure inside is the uniform 404 the
 * service throws, so this surface is never an existence oracle.
 *
 * The token shape is bounded here too (defense in depth; the relay also checks):
 * base64url, 43 chars for a 32-byte token, generous range for forward-compat.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,200}$/;

function badToken(token: string): void {
  if (!TOKEN_SHAPE.test(token)) throw new BadRequestException('invalid token');
}
function clientIp(req: Request): string | null {
  const supplied = req.headers['x-client-ip'];
  return typeof supplied === 'string' && supplied.length > 0 ? supplied : null;
}
function userAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua.length > 0 ? ua.slice(0, 512) : null;
}

@Controller('sign')
export class SigningController {
  constructor(private readonly signing: SigningService) {}

  @Get(':token')
  @Policy('sign-relay')
  @Header('Cache-Control', 'no-store')
  async view(@Param('token') token: string, @Req() req: Request): Promise<SignerView> {
    badToken(token);
    return this.signing.view(token, clientIp(req), userAgent(req));
  }

  @Get(':token/document')
  @Policy('sign-relay')
  @Header('Cache-Control', 'no-store')
  async document(@Param('token') token: string): Promise<StreamableFile> {
    badToken(token);
    const { stream, size } = await this.signing.readDocument(token);
    return new StreamableFile(stream, { type: 'application/pdf', disposition: 'inline', length: size });
  }

  @Post(':token/submit')
  @Policy('sign-relay')
  @Header('Cache-Control', 'no-store')
  async submit(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    badToken(token);
    const parsed = SubmitSignatureSchema.safeParse(body);
    // Generic on purpose — the field reasons would describe the accepted shape
    // to an unauthenticated caller, and the honest client never sees this.
    if (!parsed.success) throw new BadRequestException('That signature could not be accepted.');
    return this.signing.submit(token, parsed.data as SubmitSignature, clientIp(req), userAgent(req));
  }
}
