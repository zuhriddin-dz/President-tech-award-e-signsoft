import { Queue } from 'bullmq';
import { env } from '../config/env.js';

/**
 * One queue for all background work; job names route to processors in the
 * worker. Everything heavy lives here — nothing slow ever runs on the
 * request path.
 */
export const QUEUE_NAME = 'docflow';

export function redisConnection(): { url: string } {
  return { url: env.REDIS_URL };
}

export function createQueue(): Queue {
  return new Queue(QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: false,
    },
  });
}
