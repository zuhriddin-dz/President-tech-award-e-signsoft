import { Body, Controller, Header, Post } from '@nestjs/common';
import {
  PublicVerifyRequestSchema,
  type PublicVerifyRequest,
  type PublicVerifyResult,
} from '@docflow/contracts';
import { Policy } from '../../common/policy.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { VerifyService } from './verify.service.js';

/**
 * The public verification surface. The only route in the product reachable
 * with no credential of any kind, and deliberately so: a document's evidence
 * is worth nothing if checking it requires an account with the company that
 * issued it.
 *
 * POST rather than GET, with the digest in the body. A fingerprint in a URL
 * ends up in server logs, browser history, referrer headers and analytics —
 * places a third party's document identifier has no business being.
 */
@Controller('verify')
export class VerifyController {
  constructor(private readonly verify: VerifyService) {}

  @Post()
  @Policy('public-verify')
  @Header('Cache-Control', 'no-store')
  async byHash(
    @Body(new ZodValidationPipe(PublicVerifyRequestSchema)) body: PublicVerifyRequest,
  ): Promise<PublicVerifyResult> {
    return this.verify.byHash(body.documentHash);
  }
}
