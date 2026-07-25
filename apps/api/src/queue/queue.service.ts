import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { createQueue } from './queue.js';

/** Per-job overrides a caller may set (e.g. don't retain a token-bearing payload). */
export type EnqueueOptions = Pick<JobsOptions, 'removeOnComplete' | 'removeOnFail'>;

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue: Queue = createQueue();

  /**
   * Enqueue with an idempotency key: BullMQ dedupes on jobId, so the same
   * logical work enqueued twice (retryable webhooks, double submits) runs
   * once. Callers ALWAYS pass a deterministic id derived from the work
   * ("invite:<requestId>"), never a random one.
   */
  async enqueue(
    name: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    options?: EnqueueOptions,
  ) {
    await this.queue.add(name, payload, { jobId: idempotencyKey, ...options });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
