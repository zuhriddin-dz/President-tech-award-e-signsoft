import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import type { RateLimitRedis } from '../common/rate-limit.js';
import { createQueue } from './queue.js';

/** Per-job overrides a caller may set (e.g. don't retain a token-bearing payload). */
export type EnqueueOptions = Pick<JobsOptions, 'removeOnComplete' | 'removeOnFail'>;

const ENQUEUE_TIMEOUT_MS = 8_000;

/** Reject with `message` if `promise` hasn't settled within `ms`. */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue: Queue = createQueue();

  /**
   * Enqueue with an idempotency key: BullMQ dedupes on jobId, so the same
   * logical work enqueued twice (retryable webhooks, double submits) runs
   * once. Callers ALWAYS pass a deterministic id derived from the work
   * ("invite-<requestId>"), never a random one.
   *
   * BullMQ forbids ':' in a custom job id — reject it here with a clear error
   * instead of letting it surface deep in the driver at send time.
   */
  async enqueue(
    name: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    options?: EnqueueOptions,
  ) {
    if (idempotencyKey.includes(':')) {
      throw new Error(`enqueue: idempotency key must not contain ':' (got "${idempotencyKey}")`);
    }
    // Hard ceiling on the request path: no Redis state (down, half-open, slow)
    // may ever hang the caller. The connection is already fail-fast; this is
    // the backstop that makes "the request always returns" structural.
    await withTimeout(
      this.queue.add(name, payload, { jobId: idempotencyKey, ...options }),
      ENQUEUE_TIMEOUT_MS,
      `enqueue "${name}" timed out after ${ENQUEUE_TIMEOUT_MS}ms`,
    );
  }

  /**
   * The queue's own Redis connection, for the shared rate-limit window.
   *
   * Deliberately NOT a second client: one connection, one place that knows the
   * Redis URL, and the producer's fail-fast policy (bounded retries, no offline
   * queue) is exactly what a request-path rate limiter wants — a Redis that is
   * down must answer immediately so the caller can fall back, never hang.
   *
   * Returns null rather than throwing when the connection cannot be obtained;
   * the limiter treats that as "no shared view" and uses its in-process floor.
   */
  async rateLimitClient(): Promise<RateLimitRedis | null> {
    try {
      return (await this.queue.client) as unknown as RateLimitRedis;
    } catch {
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
