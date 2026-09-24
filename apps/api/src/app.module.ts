import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { ClerkService } from './auth/clerk.service.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { PolicyGuard } from './common/policy.js';
import { env } from './config/env.js';
import { HealthController } from './health/health.controller.js';
import { VerifyController } from './modules/verify/verify.controller.js';
import { VerifyService } from './modules/verify/verify.service.js';
import { DocumentsController } from './modules/documents/documents.controller.js';
import { DocumentsService } from './modules/documents/documents.service.js';
import { TemplatesController } from './modules/templates/templates.controller.js';
import { TemplatesService } from './modules/templates/templates.service.js';
import { SignatureRequestsController } from './modules/signature-requests/signature-requests.controller.js';
import { FoldersController } from './modules/signature-requests/folders.controller.js';
import { SignatureRequestsService } from './modules/signature-requests/signature-requests.service.js';
import { SigningController } from './modules/signing/signing.controller.js';
import { SigningService } from './modules/signing/signing.service.js';
import { SigningTokenResolver } from './tenant/signing-token.resolver.js';
import { PaymentResolver } from './tenant/payment.resolver.js';
import { BillingController } from './modules/billing/billing.controller.js';
import { BillingService } from './modules/billing/billing.service.js';
import { PaymeController } from './modules/billing/payme.controller.js';
import { PaymeService } from './modules/billing/payme.service.js';
import { ClickController } from './modules/billing/click.controller.js';
import { ClickService } from './modules/billing/click.service.js';
import { MeController } from './modules/me/me.controller.js';
import { OnboardingController } from './modules/onboarding/onboarding.controller.js';
import { PrismaService } from './prisma/prisma.service.js';
import { QueueService } from './queue/queue.service.js';
import { SealProvider } from './crypto/seal.provider.js';
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
  controllers: [
    HealthController,
    MeController,
    OnboardingController,
    DocumentsController,
    TemplatesController,
    SignatureRequestsController,
    FoldersController,
    SigningController,
    VerifyController,
    BillingController,
    // The two provider callbacks. Open to the internet by necessity, each
    // authenticated by its own provider's scheme rather than by a session.
    PaymeController,
    ClickController,
  ],
  providers: [
    ClerkService,
    PrismaService,
    TenantContext,
    TenantDb,
    TenantSyncService,
    StorageService,
    DocumentsService,
    TemplatesService,
    SignatureRequestsService,
    SigningService,
    SigningTokenResolver,
    PaymentResolver,
    BillingService,
    PaymeService,
    ClickService,
    QueueService,
    SealProvider,
    VerifyService,
    // Global default-deny: every route must carry @Policy() or it is refused.
    { provide: APP_GUARD, useClass: PolicyGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
