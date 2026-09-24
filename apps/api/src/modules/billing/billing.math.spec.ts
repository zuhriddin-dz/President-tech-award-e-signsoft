import { describe, expect, it } from 'vitest';
import { PLAN_PRICE_TIYIN } from '@docflow/contracts';
import { grantedPeriod, priceTiyin } from './billing.math.js';

const iso = (d: Date) => d.toISOString();

describe('priceTiyin', () => {
  it('charges the list price for one month', () => {
    expect(priceTiyin('personal', 1)).toBe(PLAN_PRICE_TIYIN.personal);
    expect(priceTiyin('company', 1)).toBe(PLAN_PRICE_TIYIN.company);
  });

  it('multiplies by the months bought, with no discount and no rounding', () => {
    expect(priceTiyin('personal', 12)).toBe(9_900_000 * 12);
    expect(priceTiyin('company', 3)).toBe(29_900_000 * 3);
  });

  it('stays a whole number of tiyin, which is what the providers compare', () => {
    for (const months of [1, 2, 3, 6, 12]) {
      expect(Number.isInteger(priceTiyin('personal', months))).toBe(true);
      expect(Number.isInteger(priceTiyin('company', months))).toBe(true);
    }
  });

  it('refuses a months value that would charge or grant the wrong thing', () => {
    expect(() => priceTiyin('personal', 0)).toThrow();
    expect(() => priceTiyin('personal', -1)).toThrow();
    expect(() => priceTiyin('personal', 1.5)).toThrow();
    expect(() => priceTiyin('personal', 13)).toThrow();
    expect(() => priceTiyin('personal', Number.NaN)).toThrow();
  });
});

describe('grantedPeriod', () => {
  const now = new Date('2026-09-24T09:30:00.000Z');

  it('starts now for a workspace that has never paid', () => {
    const { start, end } = grantedPeriod(null, 1, now);
    expect(iso(start)).toBe('2026-09-24T09:30:00.000Z');
    expect(iso(end)).toBe('2026-10-24T09:30:00.000Z');
  });

  it('adds to the time left when renewing early, rather than discarding it', () => {
    const paidUntil = new Date('2026-10-04T09:30:00.000Z'); // 10 days still to run
    const { start, end } = grantedPeriod(paidUntil, 1, now);
    expect(iso(start)).toBe('2026-10-04T09:30:00.000Z');
    expect(iso(end)).toBe('2026-11-04T09:30:00.000Z');
  });

  it('starts now for a lapsed workspace, never in the past', () => {
    const lapsed = new Date('2026-08-01T00:00:00.000Z');
    const { start, end } = grantedPeriod(lapsed, 1, now);
    expect(iso(start)).toBe(iso(now));
    expect(iso(end)).toBe('2026-10-24T09:30:00.000Z');
  });

  it('counts calendar months, so the anniversary day is kept', () => {
    const jan5 = new Date('2026-01-05T12:00:00.000Z');
    expect(iso(grantedPeriod(null, 1, jan5).end)).toBe('2026-02-05T12:00:00.000Z');
    expect(iso(grantedPeriod(null, 12, jan5).end)).toBe('2027-01-05T12:00:00.000Z');
  });

  it('clamps to the end of a short month instead of overflowing into the next', () => {
    // The naive setUTCMonth(+1) on 31 January lands on 3 March — two free days,
    // every month, for the life of the account.
    const jan31 = new Date('2026-01-31T12:00:00.000Z');
    expect(iso(grantedPeriod(null, 1, jan31).end)).toBe('2026-02-28T12:00:00.000Z');

    const aug31 = new Date('2026-08-31T00:00:00.000Z');
    expect(iso(grantedPeriod(null, 1, aug31).end)).toBe('2026-09-30T00:00:00.000Z');
  });

  it('clamps to 29 February in a leap year', () => {
    const jan31 = new Date('2028-01-31T12:00:00.000Z');
    expect(iso(grantedPeriod(null, 1, jan31).end)).toBe('2028-02-29T12:00:00.000Z');
  });

  it('takes the day from the original date, so a clamp does not stick', () => {
    // Buy 12 months from 31 January: the anniversary is 31 January, not 28
    // February, because the day comes from the start date rather than from a
    // previously clamped result.
    const jan31 = new Date('2026-01-31T12:00:00.000Z');
    expect(iso(grantedPeriod(null, 12, jan31).end)).toBe('2027-01-31T12:00:00.000Z');
  });

  it('crosses a year boundary', () => {
    const nov15 = new Date('2026-11-15T08:00:00.000Z');
    expect(iso(grantedPeriod(null, 3, nov15).end)).toBe('2027-02-15T08:00:00.000Z');
  });

  it('never returns a period that ends before it starts', () => {
    for (const months of [1, 2, 3, 6, 12]) {
      const { start, end } = grantedPeriod(null, months, now);
      expect(end.getTime()).toBeGreaterThan(start.getTime());
    }
  });

  it('does not mutate the date it was handed', () => {
    const paidUntil = new Date('2026-10-04T09:30:00.000Z');
    grantedPeriod(paidUntil, 6, now);
    expect(iso(paidUntil)).toBe('2026-10-04T09:30:00.000Z');
  });
});
