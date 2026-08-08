import { Controller, Get } from '@nestjs/common';
import { Policy } from '../common/policy.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Subsystem = 'ok' | 'down';

/**
 * Two different questions, deliberately on two routes.
 *
 * /health is LIVENESS: is this process running? It touches nothing, because
 * App Platform restarts the container when it fails. Wiring a database check
 * into it would turn a thirty-second Neon blip into a restart loop — the
 * platform killing a healthy API over a fault restarting cannot fix.
 *
 * /health/ready is READINESS: can this process do its job? It checks the
 * dependencies, is never the platform's probe, and exists for an external
 * uptime monitor — the thing that notices the API is gone when no request of
 * ours is being made. It reveals nothing a caller could not learn by trying a
 * real request.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Policy('public')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @Policy('public')
  async ready(): Promise<{ status: 'ok' | 'degraded'; database: Subsystem }> {
    // SELECT 1 over the pooled runtime connection: proves the pool, the network
    // and the credentials without reading a row of anyone's data.
    let database: Subsystem;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch {
      // Swallowed on purpose. A monitor needs up or down; the error text would
      // put connection details on an unauthenticated route.
      database = 'down';
    }
    return { status: database === 'ok' ? 'ok' : 'degraded', database };
  }
}
