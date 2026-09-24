import { describe, expect, it } from 'vitest';
import {
  accessLocked,
  CheckoutRequestSchema,
  MAX_BILLING_MONTHS,
  PaymentSchema,
  PLAN_PRICE_TIYIN,
  sumFromTiyin,
  TIYIN_PER_SUM,
  type TenantAccess,
} from './index';

/**
 * The contract both sides of the money agree on. These are the facts a bug
 * would express as a customer being charged the wrong amount, or being locked
 * out while paid up.
 */

describe('the price list', () => {
  it('is in whole tiyin, and positive', () => {
    for (const [plan, tiyin] of Object.entries(PLAN_PRICE_TIYIN)) {
      expect(Number.isInteger(tiyin), plan).toBe(true);
      expect(tiyin, plan).toBeGreaterThan(0);
    }
  });

  it('is a whole number of so’m, because Click can only quote whole so’m', () => {
    for (const [plan, tiyin] of Object.entries(PLAN_PRICE_TIYIN)) {
      expect(tiyin % TIYIN_PER_SUM, plan).toBe(0);
    }
  });

  it('is the price the product actually advertises', () => {
    // Pinned deliberately: these two numbers appear on the landing page, on
    // the Get Pro page and in the amount each provider is told to charge, and
    // they have to be the same number in all three.
    expect(sumFromTiyin(PLAN_PRICE_TIYIN.personal)).toBe(99_000);
    expect(sumFromTiyin(PLAN_PRICE_TIYIN.company)).toBe(299_000);
  });
});

describe('sumFromTiyin', () => {
  it('converts tiyin to so’m', () => {
    expect(sumFromTiyin(9_900_000)).toBe(99_000);
    expect(sumFromTiyin(100)).toBe(1);
    expect(sumFromTiyin(0)).toBe(0);
  });

  it('throws rather than rounding an amount that is not whole so’m', () => {
    // Rounding here would mean quoting Click a different amount from the one
    // recorded against the payment, and Click refuses a mismatch — better to
    // fail where the price is set than at the customer's checkout.
    expect(() => sumFromTiyin(99_001)).toThrow();
    expect(() => sumFromTiyin(1)).toThrow();
    expect(() => sumFromTiyin(10.5)).toThrow();
  });
});

describe('accessLocked', () => {
  const base = { daysLeft: 0, trialEndsAt: '2026-08-08T09:00:00.000Z', paidUntil: null };
  const access = (state: TenantAccess['state']): TenantAccess => ({ ...base, state });

  it('locks time that has run out, free or paid', () => {
    expect(accessLocked(access('ended'))).toBe(true);
    expect(accessLocked(access('lapsed'))).toBe(true);
  });

  it('locks nothing that still has time on it', () => {
    expect(accessLocked(access('trial'))).toBe(false);
    expect(accessLocked(access('pro'))).toBe(false);
  });
});

describe('CheckoutRequestSchema', () => {
  const valid = { plan: 'personal', provider: 'payme' };

  it('buys one month unless told otherwise', () => {
    expect(CheckoutRequestSchema.parse(valid).months).toBe(1);
  });

  it('accepts both providers and both buyable plans', () => {
    for (const plan of ['personal', 'company']) {
      for (const provider of ['payme', 'click']) {
        expect(() => CheckoutRequestSchema.parse({ plan, provider })).not.toThrow();
      }
    }
  });

  it('refuses a months value that would charge or grant the wrong thing', () => {
    // months multiplies BOTH the price and the access granted, so it is the
    // one field where a bad value is a free subscription.
    for (const months of [0, -1, 1.5, MAX_BILLING_MONTHS + 1, Number.NaN]) {
      expect(() => CheckoutRequestSchema.parse({ ...valid, months }), String(months)).toThrow();
    }
    expect(() => CheckoutRequestSchema.parse({ ...valid, months: MAX_BILLING_MONTHS })).not.toThrow();
  });

  it('refuses a plan that is not for sale, and a provider we do not use', () => {
    expect(() => CheckoutRequestSchema.parse({ ...valid, plan: 'scale' })).toThrow();
    expect(() => CheckoutRequestSchema.parse({ ...valid, plan: 'pro' })).toThrow();
    expect(() => CheckoutRequestSchema.parse({ ...valid, provider: 'stripe' })).toThrow();
  });

  it('takes no amount from the browser at all', () => {
    // The price is looked up from the plan on the server. If the amount could
    // be sent, it could be edited.
    const parsed = CheckoutRequestSchema.parse({ ...valid, amountTiyin: 1 });
    expect(parsed).not.toHaveProperty('amountTiyin');
  });
});

describe('PaymentSchema', () => {
  const paid = {
    id: '3f2f1a10-9c3b-4b2e-9d3e-2a1b3c4d5e6f',
    plan: 'personal',
    provider: 'click',
    status: 'paid',
    amountTiyin: 9_900_000,
    months: 1,
    createdAt: '2026-09-24T09:00:00.000Z',
    paidAt: '2026-09-24T09:01:00.000Z',
    periodEnd: '2026-10-24T09:01:00.000Z',
  };

  it('parses a settled payment', () => {
    expect(PaymentSchema.parse(paid).status).toBe('paid');
  });

  it('allows a pending payment to have no dates yet', () => {
    expect(() =>
      PaymentSchema.parse({ ...paid, status: 'pending', paidAt: null, periodEnd: null }),
    ).not.toThrow();
  });

  it('strips anything the API should not be sending', () => {
    const parsed = PaymentSchema.parse({ ...paid, tenantId: 'leak', providerTxnId: 'leak' });
    expect(parsed).not.toHaveProperty('tenantId');
    expect(parsed).not.toHaveProperty('providerTxnId');
  });
});
