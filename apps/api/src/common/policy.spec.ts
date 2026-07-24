import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { VerifiedIdentity } from '../auth/claims.js';
import type { ClerkService } from '../auth/clerk.service.js';
import type { TenantSyncService } from '../tenant/tenant-sync.service.js';
import type { RequestAuth } from '../tenant/tenant-context.js';
import { Policy, PolicyGuard, POLICY_KEY } from './policy.js';

const identity: VerifiedIdentity = {
  clerkUserId: 'user_1',
  email: 'a@b.c',
  clerkOrgId: 'org_1',
  orgName: 'Org',
  role: 'VIEWER',
};

function guardWith(role: RequestAuth['role']): PolicyGuard {
  const clerk = { verifyBearer: async () => ({ ...identity, role }) } as unknown as ClerkService;
  const sync = {
    establish: async (id: VerifiedIdentity) =>
      ({ userId: 'u', clerkUserId: id.clerkUserId, tenantId: 't', role: id.role }) as RequestAuth,
  } as unknown as TenantSyncService;
  return new PolicyGuard(new Reflector(), clerk, sync);
}

function contextFor(handler: object, authorization?: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}

function declared(policy: string): object {
  const handler = () => {};
  Reflect.defineMetadata(POLICY_KEY, policy, handler);
  return handler;
}

describe('default-deny policy guard', () => {
  it('denies a route that declares NO policy', async () => {
    await expect(guardWith('OWNER').canActivate(contextFor(() => {}))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows a route declared public, without any token', async () => {
    const handler = () => {};
    Policy('public')(undefined as unknown as object, 'h', {
      value: handler,
    } as PropertyDescriptor);
    await expect(guardWith('VIEWER').canActivate(contextFor(handler))).resolves.toBe(true);
  });

  it('rejects a protected route without a bearer token', async () => {
    await expect(guardWith('OWNER').canActivate(contextFor(declared('viewer')))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('VIEWER is refused on an admin route; ADMIN passes', async () => {
    const route = declared('admin');
    await expect(
      guardWith('VIEWER').canActivate(contextFor(route, 'Bearer t')),
    ).rejects.toThrow(ForbiddenException);
    await expect(guardWith('ADMIN').canActivate(contextFor(route, 'Bearer t'))).resolves.toBe(
      true,
    );
  });

  it('fails closed on a policy value it does not know', async () => {
    await expect(
      guardWith('OWNER').canActivate(contextFor(declared('superuser'), 'Bearer t')),
    ).rejects.toThrow(ForbiddenException);
  });
});
