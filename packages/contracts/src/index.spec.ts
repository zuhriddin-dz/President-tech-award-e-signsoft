import { describe, expect, it } from 'vitest';
import { MeResponseSchema, PACKAGE_NAME } from './index.js';

describe('@docflow/contracts', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@docflow/contracts');
  });

  it('MeResponse accepts the wire shape and rejects drift', () => {
    const good = {
      userId: '3f2f1a10-9c3b-4b2e-9d3e-2a1b3c4d5e6f',
      role: 'ADMIN',
      tenant: { id: '3f2f1a10-9c3b-4b2e-9d3e-2a1b3c4d5e6f', name: 'Acme', kind: 'company' },
    };
    expect(MeResponseSchema.parse(good)).toEqual(good);
    // Extra keys are stripped — an over-sharing API response cannot reach the UI.
    const overshared = MeResponseSchema.parse({ ...good, secretColumn: 'leak' });
    expect(overshared).not.toHaveProperty('secretColumn');
    expect(() => MeResponseSchema.parse({ ...good, role: 'SUPERUSER' })).toThrow();
  });
});
