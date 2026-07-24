import 'reflect-metadata';
import { Worker } from 'bullmq';
import { pino } from 'pino';
import { env } from './config/env.js';
import { QUEUE_NAME, redisConnection } from './queue/queue.js';
import { processors } from './queue/processors.js';

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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // Finish in-flight jobs, then exit — a mid-job kill is also safe (the job
    // stalls and re-delivers), this just avoids the wait.
    void worker.close().then(() => process.exit(0));
  });
}

logger.info({ queue: QUEUE_NAME }, 'worker up');
