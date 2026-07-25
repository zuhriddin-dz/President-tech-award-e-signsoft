import { Controller, ForbiddenException, Post } from '@nestjs/common';
import { Policy } from '../../common/policy.js';
import { TenantContext } from '../../tenant/tenant-context.js';
import { TenantSyncService } from '../../tenant/tenant-sync.service.js';

/**
 * The one route reachable by a verified user who has NO workspace yet — it
 * creates their personal workspace from the verified Clerk identity (never
 * client input). Company workspaces are created by Clerk's org flow instead,
 * which the normal role guard then picks up.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly context: TenantContext,
    private readonly sync: TenantSyncService,
  ) {}

  @Post('personal')
  @Policy('session')
  async createPersonal(): Promise<{ kind: 'personal' }> {
    const identity = this.context.identity();
    if (!identity) throw new ForbiddenException();
    // The internal tenant uuid stays server-side; the client just proceeds.
    await this.sync.establishPersonal(identity);
    return { kind: 'personal' };
  }
}
