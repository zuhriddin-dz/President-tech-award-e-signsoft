import { ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const POLICY_KEY = 'docflow:policy';

/**
 * Every route MUST declare a policy — the guard denies anything undeclared.
 * 'public' is the only policy that exists in Phase 2; authenticated policies
 * arrive with Clerk in Phase 3 and extend this union.
 */
export type PolicyName = 'public';

export const Policy = (name: PolicyName) => SetMetadata(POLICY_KEY, name);

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<PolicyName | undefined>(POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Default deny: a route someone forgot to classify is a closed door,
    // not an open one.
    if (policy === undefined) throw new ForbiddenException();
    if (policy === 'public') return true;
    // Unknown/future policies fail closed until their auth layer exists.
    throw new ForbiddenException();
  }
}
