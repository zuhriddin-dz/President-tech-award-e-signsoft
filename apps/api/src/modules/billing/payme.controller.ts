import { Body, Controller, Header, Headers, Logger, Post } from '@nestjs/common';
import { API_PATHS } from '@docflow/contracts';
import { env } from '../../config/env.js';
import { Policy } from '../../common/policy.js';
import { PaymeError, PaymeRpcError, paymeAuthorized } from './payme.protocol.js';
import { PaymeService, type PaymeParams } from './payme.service.js';

/**
 * Payme's Merchant API endpoint — one route, six methods, dispatched by name.
 *
 * EVERY response is HTTP 200, including every failure. Payme reads a non-200
 * as a transport fault and retries, so returning 404 for an unknown order
 * would turn an ordinary refusal into a retry loop against our database. The
 * outcome lives in the body: `result` or `error`, never in the status line.
 *
 * The policy is 'public' because Payme holds no Clerk session. It is NOT
 * unauthenticated: the merchant key arrives as HTTP Basic and is checked
 * first, before the body is even looked at, with a constant-time compare and
 * no database work — so an unauthorised caller costs nothing to turn away.
 */
@Controller(API_PATHS.paymeCallback.slice(1))
export class PaymeController {
  private readonly log = new Logger(PaymeController.name);

  constructor(private readonly payme: PaymeService) {}

  @Post()
  @Policy('public')
  @Header('Cache-Control', 'no-store')
  async rpc(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<PaymeRpcResponse> {
    const envelope = (body ?? {}) as { id?: unknown; method?: unknown; params?: unknown };
    const id = typeof envelope.id === 'number' || typeof envelope.id === 'string' ? envelope.id : 0;

    if (!paymeAuthorized(authorization, env.PAYME_KEY ?? null)) {
      return rpcError(id, new PaymeRpcError(PaymeError.InsufficientPrivilege));
    }

    const method = envelope.method;
    if (typeof method !== 'string') {
      return rpcError(id, new PaymeRpcError(PaymeError.InvalidRequest));
    }
    const params: PaymeParams =
      envelope.params && typeof envelope.params === 'object'
        ? (envelope.params as PaymeParams)
        : {};

    try {
      switch (method) {
        case 'CheckPerformTransaction':
          return { result: await this.payme.checkPerformTransaction(params), id };
        case 'CreateTransaction':
          return { result: await this.payme.createTransaction(params), id };
        case 'PerformTransaction':
          return { result: await this.payme.performTransaction(params), id };
        case 'CancelTransaction':
          return { result: await this.payme.cancelTransaction(params), id };
        case 'CheckTransaction':
          return { result: await this.payme.checkTransaction(params), id };
        case 'GetStatement':
          return { result: await this.payme.getStatement(params), id };
        default:
          return rpcError(id, new PaymeRpcError(PaymeError.MethodNotFound));
      }
    } catch (error) {
      if (error instanceof PaymeRpcError) return rpcError(id, error);
      // An unexpected fault is the one case where a retry is the right
      // outcome, so it is reported as something Payme will come back for —
      // and logged loudly, because it is our bug, not a refusal.
      this.log.error({ method, err: error }, 'payme callback failed');
      return rpcError(id, new PaymeRpcError(PaymeError.CannotPerform));
    }
  }
}

function rpcError(id: string | number, error: PaymeRpcError): PaymeRpcResponse {
  return { error: error.payload, id };
}

type PaymeRpcResponse =
  | { result: unknown; id: string | number }
  | { error: { code: number; message: unknown; data?: string }; id: string | number };
