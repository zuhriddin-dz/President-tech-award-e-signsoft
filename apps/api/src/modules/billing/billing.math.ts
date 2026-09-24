import { MAX_BILLING_MONTHS, PLAN_PRICE_TIYIN, type BillingPlan } from '@docflow/contracts';

/**
 * The arithmetic of a subscription: what a purchase costs, and what period it
 * grants. Pure and separate from the service, because these two answers are
 * the ones a customer will argue with us about, and a function with no
 * database and no clock of its own can be pinned down by tests exactly.
 */

/**
 * What `months` of `plan` costs, in tiyin.
 *
 * `months` comes from the browser, so it is checked here rather than trusted:
 * this number multiplies the price AND extends the access granted, so a
 * fractional or absurd value is not a validation nicety. Zod checks it at the
 * edge too — this is the floor under that, for every other caller.
 */
export function priceTiyin(plan: BillingPlan, months: number): number {
  if (!Number.isInteger(months) || months < 1 || months > MAX_BILLING_MONTHS) {
    throw new Error(`months must be a whole number from 1 to ${MAX_BILLING_MONTHS}, got ${months}`);
  }
  return PLAN_PRICE_TIYIN[plan] * months;
}

/**
 * The period a completed payment grants.
 *
 * Renewing EARLY adds to what is left instead of throwing it away: a customer
 * who pays on day 20 of a paid month gets the remaining 10 days plus the month
 * they just bought. Starting the new period at `now` would quietly charge them
 * for time they had already bought, which is the kind of billing behaviour
 * that is noticed once and never forgiven.
 *
 * A lapsed workspace starts from `now`, not from the date it lapsed: nobody
 * pays to be granted access that is already in the past.
 */
export function grantedPeriod(
  paidUntil: Date | null,
  months: number,
  now: Date,
): { start: Date; end: Date } {
  const start = paidUntil && paidUntil.getTime() > now.getTime() ? paidUntil : now;
  return { start, end: addMonths(start, months) };
}

/**
 * Calendar months, in UTC, clamped to the end of the target month.
 *
 * Calendar rather than 30-day blocks, because a subscription bought on the 5th
 * should renew on the 5th. Clamped because the naive version is a real bug:
 * 31 January plus one month, left to `setUTCMonth`, overflows into 2 or 3
 * March — the customer is handed two extra days every time, and the anniversary
 * date drifts forward for the life of the account. Here it lands on 28 (or 29)
 * February, and the day-of-month is taken from the ORIGINAL date each time, so
 * a later month restores the 31st rather than staying stuck at 28.
 */
function addMonths(from: Date, months: number): Date {
  const day = from.getUTCDate();
  const shifted = new Date(from.getTime());
  // Move to the 1st before changing the month: on the 31st, changing the month
  // first is what overflows. There is no valid date this step can skip past.
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return shifted;
}
