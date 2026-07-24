import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import { env } from '../config/env.js';
import { normalizeClaims, type VerifiedIdentity } from './claims.js';

/**
 * The only place a Clerk token is verified. Wrapping the SDK keeps the guard
 * unit-testable (stub this service) and gives one choke point for future
 * hardening (authorized parties, clock skew).
 */
@Injectable()
export class ClerkService {
  async verifyBearer(token: string): Promise<VerifiedIdentity> {
    try {
      const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
      return normalizeClaims(payload as Record<string, unknown>);
    } catch {
      // Uniform 401 — expired, forged, wrong instance: the caller learns nothing.
      throw new UnauthorizedException();
    }
  }
}
