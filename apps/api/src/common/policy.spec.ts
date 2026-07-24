import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Policy, PolicyGuard, POLICY_KEY } from './policy.js';

function contextFor(handler: object): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('default-deny policy guard', () => {
  const guard = new PolicyGuard(new Reflector());

  it('denies a route that declares NO policy', () => {
    const undeclared = () => {};
    expect(() => guard.canActivate(contextFor(undeclared))).toThrow(ForbiddenException);
  });

  it('allows a route declared public', () => {
    // Decorator applied as a plain function — specs run without the
    // experimentalDecorators transform, and a decorator IS just a function.
    const handler = () => {};
    Policy('public')(
      undefined as unknown as object,
      'handler',
      { value: handler } as PropertyDescriptor,
    );
    expect(guard.canActivate(contextFor(handler))).toBe(true);
  });

  it('fails closed on a policy value it does not know', () => {
    const future = () => {};
    Reflect.defineMetadata(POLICY_KEY, 'member', future);
    expect(() => guard.canActivate(contextFor(future))).toThrow(ForbiddenException);
  });
});
