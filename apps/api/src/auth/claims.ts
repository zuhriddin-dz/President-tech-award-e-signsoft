import type { MembershipRole } from '@docflow/db';

/** What a verified Clerk session token gives us, normalized. */
export interface VerifiedIdentity {
  clerkUserId: string;
  email: string | null;
  /** Active organization — null when the session has no org selected. */
  clerkOrgId: string | null;
  orgName: string | null;
  role: MembershipRole | null;
}

/**
 * Clerk token payloads come in two vintages: v1 (org_id / org_role, role
 * prefixed "org:") and v2 (o: { id, rol }, unprefixed). Normalize both.
 * Unknown role strings map to VIEWER — least privilege, never a guess up.
 */
export function normalizeClaims(payload: Record<string, unknown>): VerifiedIdentity {
  const o = (payload['o'] ?? null) as { id?: string; rol?: string } | null;
  const clerkOrgId = (payload['org_id'] as string | undefined) ?? o?.id ?? null;
  const rawRole = (payload['org_role'] as string | undefined) ?? o?.rol ?? null;

  return {
    clerkUserId: String(payload['sub'] ?? ''),
    email: (payload['email'] as string | undefined) ?? null,
    clerkOrgId,
    orgName: (payload['org_name'] as string | undefined) ?? null,
    role: clerkOrgId === null ? null : toMembershipRole(rawRole),
  };
}

function toMembershipRole(raw: string | null): MembershipRole {
  switch (raw?.replace(/^org:/, '').toLowerCase()) {
    case 'owner':
      return 'OWNER';
    case 'admin':
      return 'ADMIN';
    case 'member':
    case 'basic_member':
      return 'MEMBER';
    default:
      return 'VIEWER';
  }
}

const RANK: Record<MembershipRole, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };

export function roleSatisfies(actual: MembershipRole, required: MembershipRole): boolean {
  return RANK[actual] >= RANK[required];
}
