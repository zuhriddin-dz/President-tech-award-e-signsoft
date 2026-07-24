import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { ClerkService } from './auth/clerk.service.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { PolicyGuard } from './common/policy.js';
import { env } from './config/env.js';
import { HealthController } from './health/health.controller.js';
import { DocumentsController } from './modules/documents/documents.controller.js';
import { DocumentsService } from './modules/documents/documents.service.js';
import { MeController } from './modules/me/me.controller.js';
import { PrismaService } from './prisma/prisma.service.js';
import { QueueService } from './queue/queue.service.js';
import { StorageService } from './storage/storage.service.js';
import { TenantContext } from './tenant/tenant-context.js';
import { TenantDb } from './tenant/tenant-db.js';
import { TenantSyncService } from './tenant/tenant-sync.service.js';

@Module({
  imports: [
    // One CLS store per request — the vehicle for tenant context.
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
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
  controllers: [HealthController, MeController, DocumentsController],
  providers: [
    ClerkService,
    PrismaService,
    TenantContext,
    TenantDb,
    TenantSyncService,
    StorageService,
    DocumentsService,
    QueueService,
    // Global default-deny: every route must carry @Policy() or it is refused.
    { provide: APP_GUARD, useClass: PolicyGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
