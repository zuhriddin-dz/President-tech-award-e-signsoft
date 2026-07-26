import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Bounded body from day 1 — Content-Length is a claim, not a gate.
    bodyParser: true,
    rawBody: false,
  });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.disable('x-powered-by');
  // 4mb, not 1mb: the /sign submit body carries the adopted-signature PNG
  // (contract caps it at ~3MB, the relay bounds it at 3MB). A 1mb cap here
  // silently rejected legitimate uploaded signatures. Abuse is bounded by the
  // relay's byte-counting read + the new per-IP rate limits.
  app.useBodyParser('json', { limit: '4mb' });

  // Trust exactly one proxy hop (the BFF / edge) — client IPs come from the
  // trusted hop, never from an arbitrary inbound x-forwarded-for chain.
  app.set('trust proxy', 1);

  app.enableShutdownHooks();
  await app.listen(env.PORT);
}

void bootstrap();
