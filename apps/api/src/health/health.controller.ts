import { Controller, Get } from '@nestjs/common';
import { Policy } from '../common/policy.js';

@Controller('health')
export class HealthController {
  @Get()
  @Policy('public')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
