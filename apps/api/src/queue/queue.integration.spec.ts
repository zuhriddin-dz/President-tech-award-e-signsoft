/**
 * Queue semantics on real Redis: (1) jobId-based enqueue dedup, (2) retry
 * after a mid-job crash with the side effect landing EXACTLY once. Skipped
 * when Redis isn't reachable (CI).
 */
import { randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';

async function redisUp(): Promise<boolean> {
  const { Socket } = await import('node:net');
  const url = new URL(env.REDIS_URL);
  return new Promise((resolve) => {
    const sock = new Socket();
    sock.setTimeout(500);
    sock.once('connect', () => (sock.destroy(), resolve(true)));
    sock.once('error', () => resolve(false));
    sock.once('timeout', () => (sock.destroy(), resolve(false)));
    sock.connect(Number(url.port || 6379), url.hostname);
  });
}
const live = await redisUp();

const qname = `docflow-test-${randomUUID().slice(0, 8)}`;
const connection = { url: env.REDIS_URL };
let queue: Queue;

beforeAll(() => {
  queue = new Queue(qname, { connection });
});
afterAll(async () => {
  if (queue) {
    await queue.obliterate({ force: true });
    await queue.close();
  }
});

function runWorker(handler: (job: Job) => Promise<void>): Worker {
  return new Worker(qname, handler, { connection, concurrency: 1 });
}

describe.skipIf(!live)('queue semantics (live Redis)', () => {
  it('same idempotency key enqueues once', async () => {
    await queue.add('probe', { n: 1 }, { jobId: 'dedup-proof' });
    await queue.add('probe', { n: 2 }, { jobId: 'dedup-proof' });
    const counts = await queue.getJobCounts('waiting', 'delayed', 'completed');
    expect(counts['waiting']).toBe(1);
    const w = runWorker(async () => {});
    await new Promise((r) => w.on('completed', r));
    await w.close();
  }, 30_000);

  it('a job that crashes mid-flight retries, and the guarded effect lands exactly once', async () => {
    let effects = 0;
    const done = new Set<string>();
    const attempts: number[] = [];

    const w = runWorker(async (job) => {
      attempts.push(job.attemptsMade + 1);
      // The processor contract: guard the side effect on a deterministic key.
      if (!done.has(String(job.id))) {
        done.add(String(job.id));
        effects += 1;
      }
      // First attempt crashes AFTER the effect — the retry must not repeat it.
      if (job.attemptsMade === 0) throw new Error('simulated crash after side effect');
    });

    await queue.add(
      'probe',
      {},
      { jobId: `crash-proof-${randomUUID()}`, attempts: 3, backoff: { type: 'fixed', delay: 200 } },
    );
    await new Promise((r) => w.on('completed', r));
    await w.close();

    expect(attempts.length).toBeGreaterThanOrEqual(2); // it really did retry
    expect(effects).toBe(1); // the effect landed exactly once
  }, 30_000);
});
