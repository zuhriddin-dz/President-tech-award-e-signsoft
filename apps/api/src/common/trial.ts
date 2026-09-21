import type { TenantAccess, TenantPlan } from '@docflow/contracts';

/**
 * Where a workspace stands, from the two facts the database holds about it:
 * its plan, and the instant its free trial stops.
 *
 * Pure, and `now` is passed in rather than read here. The guard that locks the
 * product and the banner that counts down must answer this the same way for the
 * same request — a clock read inside would let them disagree, and "you have 1
 * day left" next to a locked screen is the kind of contradiction a customer
 * remembers.
 */
export function tenantAccess(plan: TenantPlan, trialEndsAt: Date, now: Date): TenantAccess {
  const iso = trialEndsAt.toISOString();
  if (plan === 'pro') return { state: 'pro', daysLeft: 0, trialEndsAt: iso };

  const msLeft = trialEndsAt.getTime() - now.getTime();
  if (msLeft <= 0) return { state: 'ended', daysLeft: 0, trialEndsAt: iso };

  // Rounded UP: while any part of the last day remains, the honest thing to
  // show is "1 day left", not "0 days left" on a product that still works.
  return { state: 'trial', daysLeft: Math.ceil(msLeft / 86_400_000), trialEndsAt: iso };
}

/**
 * The one question the guard asks. Kept beside tenantAccess so "locked" has a
 * single definition: a trial that ran out, and nothing else. A workspace with
 * no plan row, a clock skew, or a failed lookup is NOT locked — billing is not
 * a security boundary, and refusing real work over a billing doubt is worse
 * than serving it.
 */
export function isLocked(access: TenantAccess): boolean {
  return access.state === 'ended';
}
