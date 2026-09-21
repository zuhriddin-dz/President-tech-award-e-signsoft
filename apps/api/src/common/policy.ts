import { timingSafeEqual } from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
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
import { QueueService } from '../queue/queue.service.js';
import { SharedSlidingWindow, SlidingWindowRateLimiter } from './rate-limit.js';
import { isLocked, tenantAccess } from './trial.js';
import { TenantContext } from '../tenant/tenant-context.js';
import { TenantSyncService } from '../tenant/tenant-sync.service.js';

export const POLICY_KEY = 'docflow:policy';

/**
 * Every route MUST declare a policy — the guard denies anything undeclared.
 * 'public'     — no auth at all (health).
 * 'public-verify' — open to anyone, but per-IP throttled: the verification
 *                surface, where a caller proves nothing except that they
 *                already hold the document's fingerprint.
 * 'session'    — verified Clerk session, NO workspace required (onboarding).
 * 'sign-relay' — the public signing surface: NOT Clerk. Gated by the narrow
 *                relay secret (only apps/sign holds it); the token in the URL
 *                is the real credential, checked by the handler.
 * role names   — verified session with a workspace; the member's role must
 *                satisfy the named minimum (viewer < member < admin < owner).
 */
export type PolicyName =
  | 'public'
  | 'public-verify'
  | 'session'
  | 'sign-relay'
  | 'viewer'
  | 'member'
  | 'admin'
  | 'owner';

/** Constant-time compare of a presented header against a configured secret. */
function secretOk(header: string | undefined, expected: string | null): boolean {
  if (!header || !expected) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function relaySecretOk(header: string | undefined): boolean {
  return secretOk(header, env.SIGN_RELAY_SECRET);
}

/**
 * WHOSE ADDRESS IS THIS, REALLY.
 *
 * The API is on a public origin (api.esignsoft.uz), so any header a client can
 * set is a value the client CHOOSES. Reading `x-client-ip` — or the leftmost
 * entry of `x-forwarded-for`, which is the attacker-appendable end of the
 * chain — turns a per-IP rate limit into a per-attacker-nonce rate limit, i.e.
 * none at all.
 *
 * So there are two distinct notions here and they must not be conflated:
 *
 *   socketAddress()  — who actually opened the connection, resolved by Express
 *     under `trust proxy 1` (main.ts). Never forgeable past the trusted hop.
 *     This is what backstop limiting is keyed on.
 *
 *   trustedClientIp() — the ORIGINAL browser's address, which only a caller
 *     that proves it is one of our own front ends may assert. That proof is a
 *     shared secret; without it the header is ignored outright.
 *
 * The front ends (apps/web's /api/verify hop, apps/sign's relay) sit between
 * the browser and this API, so their socket address is the same for everybody
 * — which is why the asserted value is worth having at all, and why it has to
 * be authenticated before it is believed.
 */
function socketAddress(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function trustedClientIp(req: Request, trusted: boolean): string | null {
  if (!trusted) return null;
  const supplied = req.headers['x-client-ip'];
  if (typeof supplied !== 'string') return null;
  const value = supplied.trim();
  // Bounded and single-valued: a header is a claim, and an unbounded one is a
  // memory key an attacker gets to choose the size of.
  if (!value || value.length > 64 || value.includes(',')) return null;
  return value;
}

// Per-IP limit on the public signing surface: 60 requests / minute is generous
// for a real signer (resolve + document + consent + submit is ~4 calls) while
// shedding floods that would otherwise each cost a token-resolution DB query.
const SIGN_RATE_LIMITER = new SlidingWindowRateLimiter(60, 60_000);

/**
 * Public verification is open to the whole internet with no credential at all,
 * so it gets its own, tighter budget. A person checking a document does it
 * once or twice; 20/minute is far more than that and still cheap to serve,
 * since each call is one indexed lookup and one signature check.
 *
 * Separate from SIGN_RATE_LIMITER on purpose: a flood of verification attempts
 * must not consume the allowance a real signer needs to finish signing.
 */
const VERIFY_RATE_LIMITER = new SlidingWindowRateLimiter(20, 60_000);

/**
 * The backstop, keyed by the SOCKET address rather than any asserted one.
 *
 * It exists because the per-browser budgets above can only be enforced on a
 * value a front end vouches for, and a caller reaching this API directly
 * vouches for nothing. Without it, "the header is ignored" would mean "there is
 * no limit at all" for exactly the caller who deserves one most.
 *
 * The ceiling is deliberately far above the per-browser budgets, and the reason
 * is a trap worth stating: EVERY legitimate request arrives from a front end,
 * so all real traffic shares one or two addresses. A tight backstop would
 * therefore throttle the whole product long before it throttled an attacker —
 * a limit that fires on success. 100/second per source is a ceiling no
 * legitimate single origin reaches at this stage, while still turning an
 * unbounded flood into a bounded one. Raise it before it ever bites; do not
 * lower it to "look stricter".
 */
export const SOURCE_MAX_PER_MINUTE = 6_000;
const SIGN_SOURCE_LIMITER = new SlidingWindowRateLimiter(SOURCE_MAX_PER_MINUTE, 60_000);
const VERIFY_SOURCE_LIMITER = new SlidingWindowRateLimiter(SOURCE_MAX_PER_MINUTE, 60_000);

const MIN_ROLE = {
  viewer: 'VIEWER',
  member: 'MEMBER',
  admin: 'ADMIN',
  owner: 'OWNER',
} as const;

export const Policy = (name: PolicyName) => SetMetadata(POLICY_KEY, name);

export const ALLOW_WHEN_LOCKED_KEY = 'docflow:allow-when-locked';

/**
 * Marks a route that keeps working after a workspace's free trial has ended.
 *
 * Default-deny, exactly like @Policy: an unmarked route is refused for a locked
 * workspace, so a new endpoint cannot quietly stay open. Only two kinds of
 * route belong here — reading the workspace's own state, so the shell can draw
 * the Get Pro screen at all, and fetching documents it has ALREADY signed.
 * Those are the customer's evidence of agreements they have made; withholding
 * them to collect payment is not a lever this product pulls.
 */
export const AllowWhenLocked = () => SetMetadata(ALLOW_WHEN_LOCKED_KEY, true);

@Injectable()
export class PolicyGuard implements CanActivate {
  /**
   * Shared windows over the same budgets. Each keeps its in-process limiter as
   * the floor and adds a Redis view so the cap stays global across replicas;
   * if Redis is unreachable the floor is the whole answer. Built here (not at
   * module scope) because they need the queue's connection.
   */
  private readonly signWindow: SharedSlidingWindow;
  private readonly signSourceWindow: SharedSlidingWindow;
  private readonly verifyWindow: SharedSlidingWindow;
  private readonly verifySourceWindow: SharedSlidingWindow;

  constructor(
    private readonly reflector: Reflector,
    private readonly clerk: ClerkService,
    private readonly sync: TenantSyncService,
    private readonly tenantContext: TenantContext,
    private readonly queue: QueueService,
  ) {
    const client = () => this.queue.rateLimitClient();
    this.signWindow = new SharedSlidingWindow('sign', 60, 60_000, client, SIGN_RATE_LIMITER);
    this.signSourceWindow = new SharedSlidingWindow(
      'sign-src',
      SOURCE_MAX_PER_MINUTE,
      60_000,
      client,
      SIGN_SOURCE_LIMITER,
    );
    this.verifyWindow = new SharedSlidingWindow('verify', 20, 60_000, client, VERIFY_RATE_LIMITER);
    this.verifySourceWindow = new SharedSlidingWindow(
      'verify-src',
      SOURCE_MAX_PER_MINUTE,
      60_000,
      client,
      VERIFY_SOURCE_LIMITER,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<PolicyName | undefined>(POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Default deny: a route someone forgot to classify is a closed door.
    if (policy === undefined) throw new ForbiddenException();
    if (policy === 'public') return true;

    // Open to anyone, but not unlimited. Unlike the signing surface this is not
    // an oracle to protect — a caller must already hold the document to know
    // its fingerprint — so over-limit is an honest 429 rather than a 404.
    if (policy === 'public-verify') {
      const req = context.switchToHttp().getRequest<Request>();
      const now = Date.now();
      // The source budget applies to everyone, always: it is the only one a
      // caller that reaches this API directly can be held to.
      if (!(await this.verifySourceWindow.allow(socketAddress(req), now))) {
        throw new HttpException('Too many verification attempts.', HttpStatus.TOO_MANY_REQUESTS);
      }
      // The per-browser budget applies on top, and only to a value our own BFF
      // vouched for. Unsigned, the header is simply not read.
      const vouched = secretOk(
        req.headers['x-internal-auth'] as string | undefined,
        env.VERIFY_RELAY_SECRET ?? null,
      );
      const client = trustedClientIp(req, vouched);
      if (client && !(await this.verifyWindow.allow(client, now))) {
        throw new HttpException('Too many verification attempts.', HttpStatus.TOO_MANY_REQUESTS);
      }
      return true;
    }

    // The public signing surface: authenticated by the relay secret, not Clerk.
    // A bad/absent secret is a uniform 404 (the signing surface is never an
    // oracle), matching the relay's own single failure shape.
    if (policy === 'sign-relay') {
      const req = context.switchToHttp().getRequest<Request>();
      if (!relaySecretOk(req.headers['x-internal-auth'] as string | undefined)) {
        throw new NotFoundException('This signing link is not valid.');
      }
      // Per-IP rate limit BEFORE the handler touches the DB — defense in depth
      // behind the sign app's own edge limiter. Over-limit is the same 404.
      //
      // Holding the relay secret is what makes x-client-ip believable here, so
      // the per-signer budget is keyed on it; the source budget still applies
      // underneath, bounding a compromised relay too.
      const now = Date.now();
      if (!(await this.signSourceWindow.allow(socketAddress(req), now))) {
        throw new NotFoundException('This signing link is not valid.');
      }
      const client = trustedClientIp(req, true);
      if (client && !(await this.signWindow.allow(client, now))) {
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

    // The trial gate: after the role check, before any handler runs. ONE place,
    // so a tenant route written next month is covered the day it is written
    // rather than the day someone remembers. A locked workspace keeps only what
    // @AllowWhenLocked marks — reading itself, and downloading what it has
    // already signed. 402 with a code the shell branches on, not 403: this is
    // "pay to continue", not "you may never".
    if (auth.entitlement) {
      const access = tenantAccess(auth.entitlement.plan, auth.entitlement.trialEndsAt, new Date());
      const allowed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHEN_LOCKED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isLocked(access) && !allowed) {
        throw new HttpException(
          {
            statusCode: HttpStatus.PAYMENT_REQUIRED,
            error: 'PaymentRequired',
            message: 'Your free trial has ended.',
            code: 'TRIAL_ENDED',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }
    return true;
  }
}
