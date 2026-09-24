import { accessLocked, type TenantAccess, type TenantPlan } from '@docflow/contracts';

/**
 * Where a workspace stands, from the three facts the database holds about it:
 * its plan, the instant its free trial stops, and the instant its paid period
 * stops.
 *
 * Pure, and `now` is passed in rather than read here. The guard that locks the
 * product and the banner that counts down must answer this the same way for the
 * same request — a clock read inside would let them disagree, and "you have 1
 * day left" next to a locked screen is the kind of contradiction a customer
 * remembers.
 */
export function tenantAccess(
  plan: TenantPlan,
  trialEndsAt: Date,
  paidUntil: Date | null,
  now: Date,
): TenantAccess {
  const trialIso = trialEndsAt.toISOString();
  const paidIso = paidUntil?.toISOString() ?? null;

  if (plan === 'pro') {
    // Granted by hand (scripts/set-plan.mjs) — there is no paid period to run
    // out, so it never does. Reading a missing date as "expired long ago"
    // would lock exactly the workspaces we chose to give the product to.
    if (!paidUntil) return { state: 'pro', daysLeft: 0, trialEndsAt: trialIso, paidUntil: null };

    const msLeft = paidUntil.getTime() - now.getTime();
    if (msLeft > 0) {
      return { state: 'pro', daysLeft: daysFrom(msLeft), trialEndsAt: trialIso, paidUntil: paidIso };
    }
    // Paid once, and that period is over. The plan column stays `pro`: it
    // records that this is a customer, which is what makes the difference
    // between "renew" and "your free trial has ended" on the screen they land
    // on, and what makes the next payment a renewal rather than a first sale.
    return { state: 'lapsed', daysLeft: 0, trialEndsAt: trialIso, paidUntil: paidIso };
  }

  const msLeft = trialEndsAt.getTime() - now.getTime();
  if (msLeft <= 0) return { state: 'ended', daysLeft: 0, trialEndsAt: trialIso, paidUntil: paidIso };

  return { state: 'trial', daysLeft: daysFrom(msLeft), trialEndsAt: trialIso, paidUntil: paidIso };
}

/**
 * Rounded UP: while any part of the last day remains, the honest thing to show
 * is "1 day left", not "0 days left" on a product that still works.
 */
function daysFrom(msLeft: number): number {
  return Math.ceil(msLeft / 86_400_000);
}

/**
 * The one question the guard asks. Kept beside tenantAccess so "locked" has a
 * single definition: time ran out, whether that was the free trial or a paid
 * month nobody renewed. A workspace with no plan row, a clock skew, or a failed
 * lookup is NOT locked — billing is not a security boundary, and refusing real
 * work over a billing doubt is worse than serving it.
 */
export function isLocked(access: TenantAccess): boolean {
  return accessLocked(access);
}
