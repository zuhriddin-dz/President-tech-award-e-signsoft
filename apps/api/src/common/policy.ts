import { timingSafeEqual } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { roleSatisfies } from '../auth/claims.js';
import { ClerkService } from '../auth/clerk.service.js';
import { env } from '../config/env.js';
import { TenantContext } from '../tenant/tenant-context.js';
import { TenantSyncService } from '../tenant/tenant-sync.service.js';

export const POLICY_KEY = 'docflow:policy';

/**
 * Every route MUST declare a policy — the guard denies anything undeclared.
 * 'public'     — no auth at all (health).
 * 'session'    — verified Clerk session, NO workspace required (onboarding).
 * 'sign-relay' — the public signing surface: NOT Clerk. Gated by the narrow
 *                relay secret (only apps/sign holds it); the token in the URL
 *                is the real credential, checked by the handler.
 * role names   — verified session with a workspace; the member's role must
 *                satisfy the named minimum (viewer < member < admin < owner).
 */
export type PolicyName =
  | 'public'
  | 'session'
  | 'sign-relay'
  | 'viewer'
  | 'member'
  | 'admin'
  | 'owner';

function relaySecretOk(header: string | undefined): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(env.SIGN_RELAY_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

const MIN_ROLE = {
  viewer: 'VIEWER',
  member: 'MEMBER',
  admin: 'ADMIN',
  owner: 'OWNER',
} as const;

export const Policy = (name: PolicyName) => SetMetadata(POLICY_KEY, name);

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly clerk: ClerkService,
    private readonly sync: TenantSyncService,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<PolicyName | undefined>(POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Default deny: a route someone forgot to classify is a closed door.
    if (policy === undefined) throw new ForbiddenException();
    if (policy === 'public') return true;

    // The public signing surface: authenticated by the relay secret, not Clerk.
    // A bad/absent secret is a uniform 404 (the signing surface is never an
    // oracle), matching the relay's own single failure shape.
    if (policy === 'sign-relay') {
      const req = context.switchToHttp().getRequest<Request>();
      if (!relaySecretOk(req.headers['x-internal-auth'] as string | undefined)) {
        throw new NotFoundException('This signing link is not valid.');
      }
      return true;
    }

    const header = context.switchToHttp().getRequest<Request>().headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token) throw new UnauthorizedException();
    const identity = await this.clerk.verifyBearer(token);
    // Available to every authenticated handler (sender name, email, etc.).
    this.tenantContext.setIdentity(identity);

    // 'session': verified user, no workspace yet — onboarding routes only.
    if (policy === 'session') return true;

    const required = MIN_ROLE[policy as keyof typeof MIN_ROLE];
    if (!required) throw new ForbiddenException(); // unknown policy: fail closed

    const auth = await this.sync.establish(identity); // enters tenant context (or OnboardingRequired)
    if (!roleSatisfies(auth.role, required)) throw new ForbiddenException();
    return true;
  }
}
