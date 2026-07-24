import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { createQueue } from './queue.js';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue: Queue = createQueue();

  /**
   * Enqueue with an idempotency key: BullMQ dedupes on jobId, so the same
   * logical work enqueued twice (retryable webhooks, double submits) runs
   * once. Callers ALWAYS pass a deterministic id derived from the work
   * ("send-invite:<requestId>"), never a random one.
   */
  async enqueue(name: string, payload: Record<string, unknown>, idempotencyKey: string) {
    await this.queue.add(name, payload, { jobId: idempotencyKey });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
