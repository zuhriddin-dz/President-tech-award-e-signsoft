import { describe, expect, it } from 'vitest';
import { POLICY_KEY } from '../common/policy.js';
import { HealthController } from './health.controller.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const prismaStub = (behaviour: 'ok' | 'down') =>
  ({
    $queryRaw: async () => {
      if (behaviour === 'down') throw new Error('connection refused to db-host:5432');
      return [{ '?column?': 1 }];
    },
  }) as unknown as PrismaService;

describe('health', () => {
  it('reports ok and is explicitly declared public', () => {
    const controller = new HealthController(prismaStub('ok'));
    expect(controller.health()).toEqual({ status: 'ok' });
    expect(Reflect.getMetadata(POLICY_KEY, controller.health)).toBe('public');
  });

  // Liveness must not depend on anything a restart cannot fix. If a database
  // blip failed this route, App Platform would restart a healthy API in a loop
  // for the whole outage.
  it('liveness touches no dependency, so a dead database still reports ok', () => {
    const controller = new HealthController(prismaStub('down'));
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  describe('readiness', () => {
    it('is public, so an external uptime monitor can reach it', () => {
      const controller = new HealthController(prismaStub('ok'));
      expect(Reflect.getMetadata(POLICY_KEY, controller.ready)).toBe('public');
    });

    it('reports ok when the database answers', async () => {
      const controller = new HealthController(prismaStub('ok'));
      expect(await controller.ready()).toEqual({ status: 'ok', database: 'ok' });
    });

    it('reports degraded instead of throwing when the database is down', async () => {
      const controller = new HealthController(prismaStub('down'));
      expect(await controller.ready()).toEqual({ status: 'degraded', database: 'down' });
    });

    // The route is unauthenticated and the driver's error text names the host.
    it('never leaks the connection error to an unauthenticated caller', async () => {
      const controller = new HealthController(prismaStub('down'));
      expect(JSON.stringify(await controller.ready())).not.toContain('db-host');
    });
  });
});
