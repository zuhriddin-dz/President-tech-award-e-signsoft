import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { PolicyGuard } from './common/policy.js';
import { env } from './config/env.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.NODE_ENV === 'production' ? 'info' : 'debug',
        // Redaction is structural, not discipline: these paths never reach the
        // log stream even if a future logline naively dumps a request or body.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password',
            '*.token',
            '*.secret',
            '*.apiKey',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
  ],
  controllers: [HealthController],
  providers: [
    // Global default-deny: every route must carry @Policy() or it is refused.
    { provide: APP_GUARD, useClass: PolicyGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
