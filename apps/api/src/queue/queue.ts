import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';

/**
 * One queue for all background work; job names route to processors in the
 * worker. Everything heavy lives here — nothing slow ever runs on the
 * request path.
 */
export const QUEUE_NAME = 'docflow';

/**
 * The WORKER's connection. BullMQ requires maxRetriesPerRequest: null here —
 * a worker uses blocking commands and must keep retrying a flaky Redis rather
 * than give up. A worker waiting on Redis blocks nobody: jobs just queue.
 */
export function redisConnection(): ConnectionOptions {
  return { url: env.REDIS_URL, maxRetriesPerRequest: null };
}

/**
 * The PRODUCER's connection — the opposite policy, and the reason this exists:
 * an API request enqueues on the request path, so it must FAIL FAST when Redis
 * is unreachable. With ioredis defaults the command sits in the offline queue
 * and retries forever, which hangs the HTTP request indefinitely (the user sees
 * "Sending…" until they give up). Bounded retries + no offline queue turn that
 * into a prompt, honest error the caller can report.
 */
function producerConnection(): ConnectionOptions {
  return {
    url: env.REDIS_URL,
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 200, 1_000)),
  };
}

export function createQueue(): Queue {
  return new Queue(QUEUE_NAME, {
    connection: producerConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: false,
    },
  });
}
