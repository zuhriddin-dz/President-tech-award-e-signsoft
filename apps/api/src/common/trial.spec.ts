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
    expect(tenantAccess('trial', at(7 * DAY), null, now)).toMatchObject({
      state: 'trial',
      daysLeft: 7,
    });
    expect(tenantAccess('trial', at(2.5 * DAY), null, now)).toMatchObject({
      state: 'trial',
      daysLeft: 3,
    });
    expect(tenantAccess('trial', at(1_000), null, now)).toMatchObject({
      state: 'trial',
      daysLeft: 1,
    });
  });

  it('ends the moment the deadline passes, and not before', () => {
    expect(tenantAccess('trial', at(1), null, now).state).toBe('trial');
    expect(tenantAccess('trial', at(0), null, now).state).toBe('ended');
    expect(tenantAccess('trial', at(-1), null, now).state).toBe('ended');
  });

  it('reports no days left once it has ended', () => {
    expect(tenantAccess('trial', at(-5 * DAY), null, now)).toMatchObject({
      state: 'ended',
      daysLeft: 0,
    });
  });

  it('never locks a hand-granted pro workspace, which has no paid period to end', () => {
    expect(tenantAccess('pro', at(-100 * DAY), null, now)).toMatchObject({
      state: 'pro',
      daysLeft: 0,
      paidUntil: null,
    });
  });

  it('counts down the paid period, and lapses when it runs out', () => {
    expect(tenantAccess('pro', at(-100 * DAY), at(30 * DAY), now)).toMatchObject({
      state: 'pro',
      daysLeft: 30,
    });
    expect(tenantAccess('pro', at(-100 * DAY), at(1), now).state).toBe('pro');
    expect(tenantAccess('pro', at(-100 * DAY), at(0), now).state).toBe('lapsed');
    expect(tenantAccess('pro', at(-100 * DAY), at(-DAY), now)).toMatchObject({
      state: 'lapsed',
      daysLeft: 0,
    });
  });

  it('distinguishes a customer whose month ran out from someone who never paid', () => {
    // Same dead trial date, same locked product — but one of them has paid us
    // before, and is told so.
    expect(tenantAccess('trial', at(-DAY), null, now).state).toBe('ended');
    expect(tenantAccess('pro', at(-DAY), at(-DAY), now).state).toBe('lapsed');
  });

  it('keeps a paid workspace working after its original trial date has passed', () => {
    // The trial deadline is stamped at sign-up and never moves, so for every
    // customer beyond their first week it is a date in the past. It must not
    // be what decides anything once they have paid.
    expect(tenantAccess('pro', at(-365 * DAY), at(15 * DAY), now).state).toBe('pro');
  });

  it('always reports both deadlines, so the page can name the date', () => {
    const trialEnds = at(3 * DAY);
    const paid = at(40 * DAY);
    expect(tenantAccess('trial', trialEnds, null, now)).toMatchObject({
      trialEndsAt: trialEnds.toISOString(),
      paidUntil: null,
    });
    expect(tenantAccess('pro', trialEnds, paid, now)).toMatchObject({
      trialEndsAt: trialEnds.toISOString(),
      paidUntil: paid.toISOString(),
    });
  });
});

describe('isLocked', () => {
  it('locks time that has run out, whether it was free or paid for', () => {
    expect(isLocked(tenantAccess('trial', at(-1), null, now))).toBe(true);
    expect(isLocked(tenantAccess('pro', at(-DAY), at(-1), now))).toBe(true);
  });

  it('locks nothing that still has time on it', () => {
    expect(isLocked(tenantAccess('trial', at(DAY), null, now))).toBe(false);
    expect(isLocked(tenantAccess('pro', at(-DAY), at(DAY), now))).toBe(false);
    expect(isLocked(tenantAccess('pro', at(-DAY), null, now))).toBe(false);
  });
});
