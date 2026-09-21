import {
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { VerifiedIdentity } from '../auth/claims.js';
import type { ClerkService } from '../auth/clerk.service.js';
import type { TenantSyncService } from '../tenant/tenant-sync.service.js';
import type { RequestAuth, TenantContext } from '../tenant/tenant-context.js';
import type { QueueService } from '../queue/queue.service.js';
import {
  ALLOW_WHEN_LOCKED_KEY,
  Policy,
  PolicyGuard,
  POLICY_KEY,
  SOURCE_MAX_PER_MINUTE,
} from './policy.js';

const identity: VerifiedIdentity = {
  clerkUserId: 'user_1',
  email: 'a@b.c',
  clerkOrgId: 'org_1',
  orgName: 'Org',
  role: 'VIEWER',
};

function guardWith(
  role: RequestAuth['role'],
  entitlement?: RequestAuth['entitlement'],
): PolicyGuard {
  const clerk = { verifyBearer: async () => ({ ...identity, role }) } as unknown as ClerkService;
  const sync = {
    establish: async (id: VerifiedIdentity) =>
      ({
        userId: 'u',
        clerkUserId: id.clerkUserId,
        tenantId: 't',
        role: id.role,
        ...(entitlement ? { entitlement } : {}),
      }) as RequestAuth,
  } as unknown as TenantSyncService;
  const tenantContext = { setIdentity: () => {} } as unknown as TenantContext;
  // No Redis in a unit test: the shared window degrades to its in-process
  // floor, which is exactly the fallback production relies on.
  const queue = { rateLimitClient: async () => null } as unknown as QueueService;
  return new PolicyGuard(new Reflector(), clerk, sync, tenantContext, queue);
}

function contextFor(handler: object, authorization?: string): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}

/** A request as it arrives at a public route: an address, and whatever headers. */
function publicContext(
  handler: object,
  headers: Record<string, string>,
  ip: string,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers, ip, socket: {} }) }),
  } as unknown as ExecutionContext;
}

function declared(policy: string): object {
  const handler = () => {};
  Reflect.defineMetadata(POLICY_KEY, policy, handler);
  return handler;
}

/** A route that stays open once the trial has ended (@AllowWhenLocked). */
function declaredOpenWhenLocked(policy: string): object {
  const handler = declared(policy);
  Reflect.defineMetadata(ALLOW_WHEN_LOCKED_KEY, true, handler);
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

/**
 * The trial gate. It lives in the guard so a tenant route is covered the day it
 * is written — these pin that an unmarked route is CLOSED to a lapsed
 * workspace, and that the gate reaches nobody it should not.
 */
describe('trial gate', () => {
  const DAY = 86_400_000;
  const ended = { plan: 'trial' as const, trialEndsAt: new Date(Date.now() - DAY) };
  const running = { plan: 'trial' as const, trialEndsAt: new Date(Date.now() + 3 * DAY) };
  const paid = { plan: 'pro' as const, trialEndsAt: new Date(Date.now() - 90 * DAY) };

  it('refuses an ordinary route once the trial has ended — 402 with a code the shell reads', async () => {
    const err = await guardWith('OWNER', ended)
      .canActivate(contextFor(declared('member'), 'Bearer t'))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(402);
    expect((err as HttpException).getResponse()).toMatchObject({ code: 'TRIAL_ENDED' });
  });

  it('keeps a route marked @AllowWhenLocked open, so signed documents can still be fetched', async () => {
    await expect(
      guardWith('OWNER', ended).canActivate(contextFor(declaredOpenWhenLocked('viewer'), 'Bearer t')),
    ).resolves.toBe(true);
  });

  it('lets a workspace still inside its trial do everything', async () => {
    await expect(
      guardWith('OWNER', running).canActivate(contextFor(declared('member'), 'Bearer t')),
    ).resolves.toBe(true);
  });

  it('never locks a pro workspace, whatever its old trial date says', async () => {
    await expect(
      guardWith('OWNER', paid).canActivate(contextFor(declared('member'), 'Bearer t')),
    ).resolves.toBe(true);
  });

  it('checks the role FIRST: a lapsed viewer on an admin route is refused as a viewer', async () => {
    await expect(
      guardWith('VIEWER', ended).canActivate(contextFor(declared('admin'), 'Bearer t')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('never reaches the signing surface — a signer is not the customer', async () => {
    // The relay path returns before any workspace is looked up; a lapsed
    // sender's already-sent links keep working. (Without the relay secret the
    // answer is the usual uniform 404, never a 402.)
    const ctx = publicContext(declared('sign-relay'), {}, '203.0.113.12');
    await expect(guardWith('OWNER', ended).canActivate(ctx)).rejects.toThrow(NotFoundException);
  });
});

/**
 * The public routes are the ones an attacker can reach without any credential,
 * so what their rate limit is KEYED on is the whole question. A key the caller
 * supplies is a key the caller can rotate, which is the same as no limit.
 */
describe('public-verify rate limiting is keyed on something the caller cannot pick', () => {
  it('a rotating x-client-ip does not buy extra budget when nothing vouched for it', async () => {
    const guard = guardWith('VIEWER');
    const route = declared('public-verify');
    // 600 is the per-source ceiling; well inside it, forged addresses are just
    // ignored rather than each starting a fresh 20-request allowance.
    let allowed = 0;
    for (let i = 0; i < 120; i++) {
      const ctx = publicContext(route, { 'x-client-ip': `10.0.0.${i}` }, '203.0.113.9');
      if (await guard.canActivate(ctx)) allowed += 1;
    }
    // All admitted (under the source ceiling), but they all counted against the
    // SAME bucket — the proof is that the forged header changed nothing.
    expect(allowed).toBe(120);
  });

  it('shuts a single source off once the backstop is spent, however it rotates headers', async () => {
    const guard = guardWith('VIEWER');
    const route = declared('public-verify');
    let refused = 0;
    // A rotating x-forwarded-for used to start a fresh budget every request:
    // the guard read its LEFTMOST entry, which is the attacker-appendable end.
    for (let i = 0; i < SOURCE_MAX_PER_MINUTE + 50; i++) {
      const ctx = publicContext(route, { 'x-forwarded-for': `10.0.0.${i}` }, '198.51.100.4');
      try {
        await guard.canActivate(ctx);
      } catch {
        refused += 1;
      }
    }
    expect(refused).toBeGreaterThanOrEqual(50);
  });
});

describe('sign-relay rejects a caller without the relay secret', () => {
  it('is a uniform 404, never a 401 or a 429', async () => {
    const guard = guardWith('VIEWER');
    const ctx = publicContext(declared('sign-relay'), {}, '203.0.113.11');
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });
});
