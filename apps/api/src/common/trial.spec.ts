import { describe, expect, it } from 'vitest';
import { isLocked, tenantAccess } from './trial.js';

/**
 * This decides when a paying-or-not workspace loses the product, so the
 * boundary matters: one second before the deadline the customer is still
 * working, one second after they see the Get Pro page.
 */
const DAY = 86_400_000;
const now = new Date('2026-09-20T12:00:00.000Z');
const at = (msFromNow: number) => new Date(now.getTime() + msFromNow);

describe('tenantAccess', () => {
  it('counts whole days left during the trial, rounding a part-day up', () => {
    expect(tenantAccess('trial', at(7 * DAY), now)).toMatchObject({ state: 'trial', daysLeft: 7 });
    expect(tenantAccess('trial', at(2.5 * DAY), now)).toMatchObject({ state: 'trial', daysLeft: 3 });
    expect(tenantAccess('trial', at(1_000), now)).toMatchObject({ state: 'trial', daysLeft: 1 });
  });

  it('ends the moment the deadline passes, and not before', () => {
    expect(tenantAccess('trial', at(1), now).state).toBe('trial');
    expect(tenantAccess('trial', at(0), now).state).toBe('ended');
    expect(tenantAccess('trial', at(-1), now).state).toBe('ended');
  });

  it('reports no days left once it has ended', () => {
    expect(tenantAccess('trial', at(-5 * DAY), now)).toMatchObject({ state: 'ended', daysLeft: 0 });
  });

  it('never locks a pro workspace, whatever its old trial date says', () => {
    expect(tenantAccess('pro', at(-100 * DAY), now)).toMatchObject({ state: 'pro', daysLeft: 0 });
    expect(tenantAccess('pro', at(3 * DAY), now).state).toBe('pro');
  });

  it('always reports the deadline itself, so the page can name the date', () => {
    const ends = at(3 * DAY);
    expect(tenantAccess('trial', ends, now).trialEndsAt).toBe(ends.toISOString());
    expect(tenantAccess('pro', ends, now).trialEndsAt).toBe(ends.toISOString());
  });
});

describe('isLocked', () => {
  it('locks an ended trial and nothing else', () => {
    expect(isLocked(tenantAccess('trial', at(-1), now))).toBe(true);
    expect(isLocked(tenantAccess('trial', at(DAY), now))).toBe(false);
    expect(isLocked(tenantAccess('pro', at(-DAY), now))).toBe(false);
  });
});
