import { describe, expect, it } from 'vitest';
import { normalizeClaims, roleSatisfies } from './claims.js';

describe('claim normalization', () => {
  it('reads v1 payloads (org_id / org_role with org: prefix)', () => {
    const id = normalizeClaims({ sub: 'user_1', org_id: 'org_1', org_role: 'org:admin' });
    expect(id).toMatchObject({ clerkUserId: 'user_1', clerkOrgId: 'org_1', role: 'ADMIN' });
  });

  it('reads v2 payloads (o.id / o.rol, unprefixed)', () => {
    const id = normalizeClaims({ sub: 'user_1', o: { id: 'org_2', rol: 'member' } });
    expect(id).toMatchObject({ clerkOrgId: 'org_2', role: 'MEMBER' });
  });

  it('maps an UNKNOWN role to VIEWER — least privilege, never a guess up', () => {
    const id = normalizeClaims({ sub: 'u', org_id: 'o', org_role: 'org:superboss' });
    expect(id.role).toBe('VIEWER');
  });

  it('no active org → no role, no tenant', () => {
    const id = normalizeClaims({ sub: 'user_1' });
    expect(id.clerkOrgId).toBeNull();
    expect(id.role).toBeNull();
  });
});

describe('role ranking', () => {
  it('orders OWNER > ADMIN > MEMBER > VIEWER', () => {
    expect(roleSatisfies('OWNER', 'ADMIN')).toBe(true);
    expect(roleSatisfies('ADMIN', 'ADMIN')).toBe(true);
    expect(roleSatisfies('MEMBER', 'ADMIN')).toBe(false);
    expect(roleSatisfies('VIEWER', 'MEMBER')).toBe(false);
    expect(roleSatisfies('VIEWER', 'VIEWER')).toBe(true);
  });
});
