import 'reflect-metadata';
import { Worker } from 'bullmq';
import { pino } from 'pino';
import { env } from './config/env.js';
import { QUEUE_NAME, redisConnection } from './queue/queue.js';
import { processors } from './queue/processors.js';
import { completeSignature } from './modules/signing/completion.js';
import { findStrandedCompletions } from './tenant/stranded-completions.js';
import { sweepExpiredEnvelopes, sweepReminders } from './modules/signature-requests/lifecycle.js';
import { Alerter, FailureStreak } from './ops/alerts.js';
import { ResendSender } from './email/resend.sender.js';

/**
 * The worker process — same codebase as the API, second entrypoint, scaled
 * independently. Consumes everything the API enqueues: from Phase 10 on,
 * stamp→hash→seal→certificate, email, webhooks.
 *
 * Crash-safety contract: BullMQ re-delivers stalled/failed jobs, so every
 * processor MUST be idempotent (guard side effects on a deterministic key).
 */
const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const processor = processors[job.name];
    if (!processor) throw new Error(`No processor for job "${job.name}"`);
    logger.debug({ jobId: job.id, name: job.name, attempt: job.attemptsMade + 1 }, 'job start');
    await processor(job.data as Record<string, unknown>);
    logger.info({ jobId: job.id, name: job.name }, 'job done');
  },
  { connection: redisConnection(), concurrency: 5 },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, name: job?.name, err: err.message }, 'job failed');
});

/**
 * The reconciler. A signature is committed before its completion job is
 * enqueued, so an enqueue failure (or a lost job) would strand real evidence:
 * completed, but never sealed or delivered. This sweep is the safety net that
 * makes "the signature is never lost" true rather than aspirational.
 */
const RECONCILE_INTERVAL_MS = 60_000;

/**
 * Alert after five consecutive failures — about five minutes at this interval.
 * Long enough that a redeploy, a database failover or a momentary R2 blip
 * resolves itself in silence; short enough that a real fault is known about
 * while it is still a handful of documents rather than a day of them.
 */
const ALERT_AFTER_FAILURES = 5;
const alerter = new Alerter(new ResendSender(), env.ALERT_EMAIL ?? null, logger);
const sealingFailures = new FailureStreak(ALERT_AFTER_FAILURES);
const sweepFailures = new FailureStreak(ALERT_AFTER_FAILURES);

async function reconcile(): Promise<void> {
  try {
    const stranded = await findStrandedCompletions();
    for (const s of stranded) {
      logger.warn({ requestId: s.requestId }, 'reconciling stranded completion');
      try {
        await completeSignature(s.tenant, s.requestId);
        sealingFailures.succeed(s.requestId);
        alerter.clear(`seal:${s.requestId}`);
      } catch (err) {
        const message = (err as Error).message;
        logger.error(
          { requestId: s.requestId, err: message },
          'reconcile attempt failed (will retry next sweep)',
        );
        // A signature that cannot be sealed is the one failure nobody notices:
        // the signer saw success, the evidence is safe, and only the delivery
        // is missing. It stays wrong until somebody is told.
        if (sealingFailures.fail(s.requestId)) {
          await alerter.raise(
            `seal:${s.requestId}`,
            'A signed document cannot be sealed',
            [
              `Request ${s.requestId} has failed to complete ${ALERT_AFTER_FAILURES} times.`,
              '',
              `Error: ${message}`,
              '',
              'The signature itself is committed and safe — sealing and delivery',
              'are what is stuck. The sweep keeps retrying, so fixing the cause',
              'is enough; nobody has to sign anything again.',
            ].join('\n'),
          );
        }
      }
    }
    sweepFailures.succeed('reconcile');
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ err: message }, 'reconcile sweep failed');
    // The sweep itself failing means the safety net is down — usually the
    // database being unreachable, which no individual request will report.
    if (sweepFailures.fail('reconcile')) {
      await alerter.raise(
        'sweep:reconcile',
        'The reconcile sweep is failing',
        [
          `The reconcile sweep has failed ${ALERT_AFTER_FAILURES} times running.`,
          '',
          `Error: ${message}`,
          '',
          'While it is down, a signature that completes without its follow-up',
          'job will not be picked up. Nothing is lost; delivery stops.',
        ].join('\n'),
      );
    }
  }

  // The envelope lifecycle: nudge the stalled, retire the lapsed. Both are
  // best-effort — a failure here must never stop the reconciler above.
  try {
    const expired = await sweepExpiredEnvelopes();
    if (expired > 0) logger.info({ expired }, 'retired expired envelopes');
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'expiry sweep failed');
  }
  try {
    const reminded = await sweepReminders();
    if (reminded > 0) logger.info({ reminded }, 'sent reminders');
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'reminder sweep failed');
  }
}
const reconcileTimer = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
reconcileTimer.unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // Finish in-flight jobs, then exit — a mid-job kill is also safe (the job
    // stalls and re-delivers), this just avoids the wait.
    void worker.close().then(() => process.exit(0));
  });
}

logger.info({ queue: QUEUE_NAME }, 'worker up');
