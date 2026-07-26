import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { MembershipRole } from '@docflow/db';
import type { VerifiedIdentity } from '../auth/claims.js';

/**
 * apps/api/src/tenant/ — THE sanctioned tenant territory (security-lint
 * exempts exactly this folder). Tenant identity enters request context here
 * and only here, always derived from a VERIFIED session token upstream.
 * Everything else reads it via the getters; nothing outside this folder may
 * take a tenantId parameter or read one from client data.
 */

export interface RequestAuth {
  userId: string; // our users.id
  clerkUserId: string;
  tenantId: string; // our tenants.id
  role: MembershipRole;
}

const AUTH_KEY = 'docflow:auth';
const IDENTITY_KEY = 'docflow:identity';

@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}

  /** The ONE writer. Called by the policy guard after verification + sync. */
  enter(auth: RequestAuth): void {
    this.cls.set(AUTH_KEY, auth);
  }

  auth(): RequestAuth | null {
    return this.cls.get<RequestAuth | null>(AUTH_KEY) ?? null;
  }

  /** Fail-closed accessor: throws when no tenant context exists. */
  requireAuth(): RequestAuth {
    const auth = this.auth();
    if (!auth) throw new Error('No tenant context on this request');
    return auth;
  }

  /**
   * Enter tenant context for the SESSIONLESS signer path — a resolved signing
   * token, no user/role. Only the token resolver in this folder calls it. Uses
   * a sentinel userId/role so TenantDb.tx() (which reads tenantId) works; the
   * signer routes never consult role.
   */
  enterAsSigner(tenantId: string): void {
    this.cls.set(AUTH_KEY, {
      userId: '00000000-0000-0000-0000-000000000000',
      clerkUserId: 'signer',
      tenantId,
      role: 'VIEWER',
    });
  }

  /**
   * The verified Clerk identity, stored by the guard BEFORE any tenant exists
   * (the 'session' policy). Onboarding reads it to create the first workspace.
   */
  setIdentity(identity: VerifiedIdentity): void {
    this.cls.set(IDENTITY_KEY, identity);
  }

  identity(): VerifiedIdentity | null {
    return this.cls.get<VerifiedIdentity | null>(IDENTITY_KEY) ?? null;
  }
}
