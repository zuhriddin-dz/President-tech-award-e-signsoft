import { describe, expect, it } from 'vitest';
import { POLICY_KEY } from '../common/policy.js';
import { HealthController } from './health.controller.js';

describe('health', () => {
  it('reports ok and is explicitly declared public', () => {
    const controller = new HealthController();
    expect(controller.health()).toEqual({ status: 'ok' });
    expect(Reflect.getMetadata(POLICY_KEY, controller.health)).toBe('public');
  });
});
