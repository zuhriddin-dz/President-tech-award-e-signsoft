import { Body, Controller, Header, Logger, Post } from '@nestjs/common';
import { API_PATHS } from '@docflow/contracts';
import { Policy } from '../../common/policy.js';
import { ClickCallbackSchema, ClickError, clickNote } from './click.protocol.js';
import { ClickService, type ClickResult } from './click.service.js';

/**
 * Click's two callbacks.
 *
 * Like Payme's, every answer is HTTP 200 with the outcome in the body — Click
 * reads anything else as a fault and retries. Unlike Payme's, the body arrives
 * FORM ENCODED, so every value is a string and the numeric fields are coerced
 * by the schema rather than assumed.
 *
 * 'public' policy because Click holds no session. The signature over the
 * fields is the authentication, and it is checked in the service before the
 * payment is so much as looked up.
 *
 * The echoed click_trans_id and merchant_trans_id are returned verbatim, and
 * deliberately come from the REQUEST rather than from anything we looked up:
 * Click matches its own record by them, so a response that quietly corrected
 * one would be a response Click cannot reconcile.
 */
@Controller(API_PATHS.clickCallback.slice(1))
export class ClickController {
  private readonly log = new Logger(ClickController.name);

  constructor(private readonly click: ClickService) {}

  @Post('prepare')
  @Policy('public')
  @Header('Cache-Control', 'no-store')
  async prepare(@Body() body: unknown): Promise<ClickResponse> {
    return this.handle(body, (parsed) => this.click.prepare(parsed));
  }

  @Post('complete')
  @Policy('public')
  @Header('Cache-Control', 'no-store')
  async complete(@Body() body: unknown): Promise<ClickResponse> {
    return this.handle(body, (parsed) => this.click.complete(parsed));
  }

  private async handle(
    body: unknown,
    run: (parsed: ReturnType<typeof ClickCallbackSchema.parse>) => Promise<ClickResult>,
  ): Promise<ClickResponse> {
    const parsed = ClickCallbackSchema.safeParse(body);
    if (!parsed.success) {
      // Nothing to echo — the fields Click matches on are the ones missing.
      return { error: ClickError.BadRequest, error_note: clickNote(ClickError.BadRequest) };
    }

    const echo = {
      click_trans_id: parsed.data.click_trans_id,
      merchant_trans_id: parsed.data.merchant_trans_id,
    };

    try {
      return { ...echo, ...(await run(parsed.data)) };
    } catch (error) {
      this.log.error({ err: error }, 'click callback failed');
      return { ...echo, error: ClickError.FailedToUpdate, error_note: clickNote(ClickError.FailedToUpdate) };
    }
  }
}

interface ClickResponse {
  click_trans_id?: string;
  merchant_trans_id?: string;
  merchant_prepare_id?: number;
  merchant_confirm_id?: number;
  error: number;
  error_note: string;
}
