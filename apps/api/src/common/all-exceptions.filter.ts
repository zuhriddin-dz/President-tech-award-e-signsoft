import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { Logger } from 'nestjs-pino';

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message?: string;
}

/**
 * The ONLY shape an error ever leaves this API in. Stack traces, driver
 * errors, and SQL live in the logs; the client gets the envelope — a 500 says
 * nothing at all beyond "internal error".
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(envelopeOf(exception).statusCode).json(envelopeOf(exception));

    if (envelopeOf(exception).statusCode >= 500) {
      // Full detail server-side only.
      this.logger.error(exception instanceof Error ? exception : { err: exception });
    }
  }
}

export function envelopeOf(exception: unknown): ErrorEnvelope {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status >= 500) return { statusCode: status, error: 'Internal Server Error' };
    // 4xx messages are ours (thrown deliberately) — safe for the client.
    const body = exception.getResponse();
    const message =
      typeof body === 'string'
        ? body
        : ((body as { message?: string | string[] }).message?.toString() ?? exception.message);
    return { statusCode: status, error: exception.name, message };
  }
  // Anything unexpected (driver error, TypeError, …) → opaque 500.
  return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Internal Server Error' };
}
