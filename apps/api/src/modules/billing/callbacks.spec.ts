import { beforeAll, describe, expect, it } from 'vitest';
import type { Payment } from '@docflow/db';
import type { PaymentProvider } from '@docflow/contracts';
import type { BillingService } from './billing.service.js';
import type { PaymentResolver } from '../../tenant/payment.resolver.js';
import { env } from '../../config/env.js';
import { PaymeError, PaymeRpcError, PaymeState } from './payme.protocol.js';
import { PaymeService } from './payme.service.js';
import { ClickAction, ClickError, clickSignature, type ClickCallback } from './click.protocol.js';
import { ClickService } from './click.service.js';

/**
 * Both provider callbacks, against fakes of the database half.
 *
 * The fakes live in this file rather than beside it because a module that
 * names a tenant id may only sit in apps/api/src/tenant/ — the security lint
 * exempts spec files for exactly this reason, and a separate helper would
 * either trip that rule or have to be written to dodge it.
 */

let counter = 0;

export function aPayment(overrides: Partial<Payment> = {}): Payment {
  counter += 1;
  return {
    id: `3f2f1a10-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    tenantId: '11111111-1111-4111-8111-111111111111',
    plan: 'personal',
    provider: 'payme',
    amountTiyin: 9_900_000,
    months: 1,
    status: 'pending',
    providerTxnId: null,
    providerCreatedAt: null,
    clickPrepareId: null,
    paidAt: null,
    cancelledAt: null,
    cancelReason: null,
    periodStart: null,
    periodEnd: null,
    createdAt: new Date('2026-09-24T09:00:00.000Z'),
    ...overrides,
  };
}

/**
 * A BillingService that keeps payments in a Map and applies the same
 * compare-and-set the real one does: activating or cancelling a payment that
 * is no longer pending changes nothing. `activations` counts the times access
 * was actually granted, which is what the retry tests assert on.
 */
export class FakeBilling {
  readonly payments = new Map<string, Payment>();
  activations = 0;
  cancellations = 0;

  constructor(...payments: Payment[]) {
    for (const p of payments) this.payments.set(p.id, p);
  }

  async find(paymentId: string, provider: PaymentProvider): Promise<Payment | null> {
    const payment = this.payments.get(paymentId);
    if (!payment || payment.provider !== provider) return null;
    return payment;
  }

  async attachProviderTxn(
    paymentId: string,
    providerTxnId: string,
    providerCreatedAt: Date,
  ): Promise<void> {
    this.patch(paymentId, { providerTxnId, providerCreatedAt });
  }

  async attachClickPrepareId(paymentId: string, clickPrepareId: number): Promise<void> {
    this.patch(paymentId, { clickPrepareId });
  }

  async activate(paymentId: string, now: Date): Promise<boolean> {
    const payment = this.payments.get(paymentId);
    if (!payment || payment.status !== 'pending') return false;
    this.activations += 1;
    const end = new Date(now.getTime() + payment.months * 30 * 86_400_000);
    this.patch(paymentId, { status: 'paid', paidAt: now, periodStart: now, periodEnd: end });
    return true;
  }

  async cancel(paymentId: string, reason: number | null, now: Date): Promise<void> {
    const payment = this.payments.get(paymentId);
    if (!payment || payment.status === 'cancelled') return;
    this.cancellations += 1;
    this.patch(paymentId, { status: 'cancelled', cancelledAt: now, cancelReason: reason });
  }

  private patch(paymentId: string, fields: Partial<Payment>): void {
    const payment = this.payments.get(paymentId);
    if (payment) this.payments.set(paymentId, { ...payment, ...fields });
  }
}

/**
 * A PaymentResolver over the same Map. Entering tenant context is the real
 * one's whole job and has nothing to assert here, so this only answers
 * "does it exist, and which payment is it".
 */
export class FakeResolver {
  constructor(private readonly billing: FakeBilling) {}

  async resolve(paymentId: string): Promise<boolean> {
    return this.billing.payments.has(paymentId);
  }

  async resolveByTxn(provider: string, txnId: string): Promise<string | null> {
    for (const payment of this.billing.payments.values()) {
      if (payment.provider === provider && payment.providerTxnId === txnId) return payment.id;
    }
    return null;
  }
}

/**
 * Payme retries. That single fact is what most of this file is about: a
 * repeated call must produce the same answer as the first one and must not
 * grant a second month, and the way that goes wrong is a customer paying once
 * and being given two.
 */

const ACCOUNT = 'order_id';
const AMOUNT = 9_900_000;

function paymeSetup(...payments: ReturnType<typeof aPayment>[]) {
  const billing = new FakeBilling(...payments);
  const resolver = new FakeResolver(billing);
  const service = new PaymeService(
    resolver as unknown as PaymentResolver,
    billing as unknown as BillingService,
  );
  return { billing, service };
}

const account = (id: string) => ({ [ACCOUNT]: id });

/** The code of the PaymeRpcError a call rejected with. */
async function codeOf(run: Promise<unknown>): Promise<number> {
  const error = await run.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PaymeRpcError);
  return (error as PaymeRpcError).code;
}

describe('CheckPerformTransaction', () => {
  it('allows a pending order quoted at the right amount', async () => {
    const payment = aPayment();
    const { service } = paymeSetup(payment);
    await expect(
      service.checkPerformTransaction({ amount: AMOUNT, account: account(payment.id) }),
    ).resolves.toEqual({ allow: true });
  });

  it('refuses an amount that is not the order’s, to the tiyin', async () => {
    const payment = aPayment();
    const { service } = paymeSetup(payment);
    for (const amount of [AMOUNT - 1, AMOUNT + 1, 1, 0]) {
      expect(
        await codeOf(service.checkPerformTransaction({ amount, account: account(payment.id) })),
      ).toBe(PaymeError.InvalidAmount);
    }
  });

  it('refuses an unknown order, and names the account field it looked in', async () => {
    const { service } = paymeSetup();
    const error = await service
      .checkPerformTransaction({ amount: AMOUNT, account: account('3f2f1a10-0000-4000-8000-999999999999') })
      .catch((e: unknown) => e as PaymeRpcError);
    expect((error as PaymeRpcError).code).toBe(PaymeError.OrderNotFound);
    expect((error as PaymeRpcError).payload.data).toBe(ACCOUNT);
  });

  it('refuses a missing or malformed account outright', async () => {
    const { service } = paymeSetup();
    expect(await codeOf(service.checkPerformTransaction({ amount: AMOUNT }))).toBe(
      PaymeError.OrderNotFound,
    );
    expect(
      await codeOf(service.checkPerformTransaction({ amount: AMOUNT, account: { wrong: 'x' } })),
    ).toBe(PaymeError.OrderNotFound);
  });

  it('refuses an order that is already paid or cancelled', async () => {
    const paid = aPayment({ status: 'paid' });
    const cancelled = aPayment({ status: 'cancelled' });
    const { service } = paymeSetup(paid, cancelled);
    for (const p of [paid, cancelled]) {
      expect(
        await codeOf(service.checkPerformTransaction({ amount: AMOUNT, account: account(p.id) })),
      ).toBe(PaymeError.OrderNotPayable);
    }
  });

  it('writes nothing — it is only a question', async () => {
    const payment = aPayment();
    const { billing, service } = paymeSetup(payment);
    await service.checkPerformTransaction({ amount: AMOUNT, account: account(payment.id) });
    expect(billing.payments.get(payment.id)).toEqual(payment);
  });
});

describe('CreateTransaction', () => {
  const now = Date.now();

  it('records Payme’s transaction and reports it as created', async () => {
    const payment = aPayment();
    const { billing, service } = paymeSetup(payment);
    const result = await service.createTransaction({
      id: 'payme-1',
      time: now,
      amount: AMOUNT,
      account: account(payment.id),
    });
    expect(result).toEqual({
      create_time: now,
      transaction: payment.id,
      state: PaymeState.Created,
    });
    expect(billing.payments.get(payment.id)?.providerTxnId).toBe('payme-1');
  });

  it('answers a repeat with the SAME create_time it first reported', async () => {
    const payment = aPayment();
    const { service } = paymeSetup(payment);
    const first = await service.createTransaction({
      id: 'payme-1',
      time: now,
      amount: AMOUNT,
      account: account(payment.id),
    });
    // Payme resends with a later `time`; the answer must not move.
    const again = await service.createTransaction({
      id: 'payme-1',
      time: now + 5_000,
      amount: AMOUNT,
      account: account(payment.id),
    });
    expect(again).toEqual(first);
  });

  it('refuses a second, different transaction against the same order', async () => {
    const payment = aPayment();
    const { service } = paymeSetup(payment);
    await service.createTransaction({
      id: 'payme-1',
      time: now,
      amount: AMOUNT,
      account: account(payment.id),
    });
    expect(
      await codeOf(
        service.createTransaction({
          id: 'payme-2',
          time: now,
          amount: AMOUNT,
          account: account(payment.id),
        }),
      ),
    ).toBe(PaymeError.CannotPerform);
  });

  it('refuses a transaction that is already older than the timeout', async () => {
    const payment = aPayment();
    const { service } = paymeSetup(payment);
    const thirteenHoursAgo = now - 13 * 60 * 60 * 1000;
    expect(
      await codeOf(
        service.createTransaction({
          id: 'payme-1',
          time: thirteenHoursAgo,
          amount: AMOUNT,
          account: account(payment.id),
        }),
      ),
    ).toBe(PaymeError.CannotPerform);
  });

  it('still checks the amount, not just the order', async () => {
    const payment = aPayment();
    const { service } = paymeSetup(payment);
    expect(
      await codeOf(
        service.createTransaction({
          id: 'payme-1',
          time: now,
          amount: 1,
          account: account(payment.id),
        }),
      ),
    ).toBe(PaymeError.InvalidAmount);
  });
});

describe('PerformTransaction', () => {
  const created = () =>
    aPayment({ providerTxnId: 'payme-1', providerCreatedAt: new Date(Date.now() - 60_000) });

  it('grants the period and reports it performed', async () => {
    const { billing, service } = paymeSetup(created());
    const result = await service.performTransaction({ id: 'payme-1' });
    expect(result.state).toBe(PaymeState.Performed);
    expect(billing.activations).toBe(1);
    expect(billing.payments.get(result.transaction)?.status).toBe('paid');
  });

  it('grants ONCE however many times Payme asks', async () => {
    const { billing, service } = paymeSetup(created());
    const first = await service.performTransaction({ id: 'payme-1' });
    const again = await service.performTransaction({ id: 'payme-1' });
    const third = await service.performTransaction({ id: 'payme-1' });
    expect(billing.activations).toBe(1);
    // And the reported time never moves, because Payme compares it.
    expect(again.perform_time).toBe(first.perform_time);
    expect(third.perform_time).toBe(first.perform_time);
  });

  it('refuses to perform a cancelled transaction', async () => {
    const { service } = paymeSetup(
      aPayment({ providerTxnId: 'payme-1', status: 'cancelled', cancelledAt: new Date() }),
    );
    expect(await codeOf(service.performTransaction({ id: 'payme-1' }))).toBe(
      PaymeError.CannotPerform,
    );
  });

  it('refuses a transaction it has never heard of', async () => {
    const { service } = paymeSetup(created());
    expect(await codeOf(service.performTransaction({ id: 'someone-elses' }))).toBe(
      PaymeError.TransactionNotFound,
    );
  });

  it('refuses one that has been sitting unperformed past the timeout', async () => {
    const stale = aPayment({
      providerTxnId: 'payme-1',
      providerCreatedAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
    });
    const { billing, service } = paymeSetup(stale);
    expect(await codeOf(service.performTransaction({ id: 'payme-1' }))).toBe(
      PaymeError.CannotPerform,
    );
    expect(billing.activations).toBe(0);
  });

  it('will not perform a payment belonging to the other provider', async () => {
    const { service } = paymeSetup(aPayment({ provider: 'click', providerTxnId: 'payme-1' }));
    expect(await codeOf(service.performTransaction({ id: 'payme-1' }))).toBe(
      PaymeError.TransactionNotFound,
    );
  });
});

describe('CancelTransaction', () => {
  it('cancels an unperformed transaction as -1', async () => {
    const { billing, service } = paymeSetup(aPayment({ providerTxnId: 'payme-1' }));
    const result = await service.cancelTransaction({ id: 'payme-1', reason: 5 });
    expect(result.state).toBe(PaymeState.CancelledBeforePerform);
    expect(billing.cancellations).toBe(1);
  });

  it('cancels a performed one as -2, because that is a refund', async () => {
    const { service } = paymeSetup(
      aPayment({ providerTxnId: 'payme-1', status: 'paid', paidAt: new Date() }),
    );
    const result = await service.cancelTransaction({ id: 'payme-1', reason: 5 });
    expect(result.state).toBe(PaymeState.CancelledAfterPerform);
  });

  it('answers a repeat with the same cancel_time', async () => {
    const { billing, service } = paymeSetup(aPayment({ providerTxnId: 'payme-1' }));
    const first = await service.cancelTransaction({ id: 'payme-1', reason: 5 });
    const again = await service.cancelTransaction({ id: 'payme-1', reason: 5 });
    expect(again.cancel_time).toBe(first.cancel_time);
    expect(billing.cancellations).toBe(1);
  });
});

describe('CheckTransaction', () => {
  it('reports a created transaction as state 1 with no perform or cancel time', async () => {
    const createdAt = new Date('2026-09-24T09:00:00.000Z');
    const { service } = paymeSetup(aPayment({ providerTxnId: 'payme-1', providerCreatedAt: createdAt }));
    expect(await service.checkTransaction({ id: 'payme-1' })).toMatchObject({
      create_time: createdAt.getTime(),
      perform_time: 0,
      cancel_time: 0,
      state: PaymeState.Created,
      reason: null,
    });
  });

  it('reports a performed transaction as state 2', async () => {
    const paidAt = new Date('2026-09-24T09:05:00.000Z');
    const { service } = paymeSetup(
      aPayment({
        providerTxnId: 'payme-1',
        providerCreatedAt: new Date('2026-09-24T09:00:00.000Z'),
        status: 'paid',
        paidAt,
      }),
    );
    expect(await service.checkTransaction({ id: 'payme-1' })).toMatchObject({
      perform_time: paidAt.getTime(),
      state: PaymeState.Performed,
    });
  });

  it('reports a refund as -2 and carries the reason back', async () => {
    const { service } = paymeSetup(
      aPayment({
        providerTxnId: 'payme-1',
        providerCreatedAt: new Date(),
        status: 'cancelled',
        paidAt: new Date(),
        cancelledAt: new Date(),
        cancelReason: 5,
      }),
    );
    expect(await service.checkTransaction({ id: 'payme-1' })).toMatchObject({
      state: PaymeState.CancelledAfterPerform,
      reason: 5,
    });
  });
});

/**
 * Click's two halves, and the signature that is the only reason to believe
 * either of them. These routes are open to the internet and every field in
 * them is guessable, so "the digest did not match" has to be the first answer
 * to almost everything.
 */

const SECRET = 'click-secret-for-tests';
const SERVICE_ID = '12345';
const AMOUNT_SUM = '99000.00';

beforeAll(() => {
  env.CLICK_SECRET_KEY = SECRET;
  env.CLICK_SERVICE_ID = SERVICE_ID;
});

function clickSetup(...payments: ReturnType<typeof aPayment>[]) {
  const billing = new FakeBilling(...payments);
  const resolver = new FakeResolver(billing);
  const service = new ClickService(
    resolver as unknown as PaymentResolver,
    billing as unknown as BillingService,
  );
  return { billing, service };
}

const clickPayment = (overrides: Parameters<typeof aPayment>[0] = {}) =>
  aPayment({ provider: 'click', ...overrides });

/** A correctly signed callback. Individual tests then break one field. */
function signed(over: Partial<ClickCallback> & { merchant_trans_id: string }): ClickCallback {
  const body: ClickCallback = {
    click_trans_id: 'click-1',
    service_id: SERVICE_ID,
    click_paydoc_id: '',
    merchant_prepare_id: '',
    amount: AMOUNT_SUM,
    action: ClickAction.Prepare,
    error: 0,
    error_note: '',
    sign_time: '2026-09-24 12:00:00',
    sign_string: '',
    ...over,
  };
  return {
    ...body,
    sign_string: clickSignature({
      clickTransId: body.click_trans_id,
      serviceId: body.service_id,
      secretKey: SECRET,
      merchantTransId: body.merchant_trans_id,
      merchantPrepareId: body.merchant_prepare_id,
      amount: body.amount,
      action: body.action,
      signTime: body.sign_time,
    }),
  };
}

describe('prepare', () => {
  it('accepts a signed callback and issues a merchant_prepare_id', async () => {
    const payment = clickPayment();
    const { billing, service } = clickSetup(payment);
    const result = await service.prepare(signed({ merchant_trans_id: payment.id }));

    expect(result.error).toBe(ClickError.Success);
    expect(result.merchant_prepare_id).toBeGreaterThan(0);
    expect(billing.payments.get(payment.id)?.clickPrepareId).toBe(result.merchant_prepare_id);
    // And it records which Click transaction this is, for reconciliation.
    expect(billing.payments.get(payment.id)?.providerTxnId).toBe('click-1');
  });

  it('answers a repeat with the SAME id, because Complete is signed with it', async () => {
    const payment = clickPayment();
    const { service } = clickSetup(payment);
    const first = await service.prepare(signed({ merchant_trans_id: payment.id }));
    const again = await service.prepare(signed({ merchant_trans_id: payment.id }));
    expect(again.merchant_prepare_id).toBe(first.merchant_prepare_id);
  });

  it('refuses a bad signature', async () => {
    const payment = clickPayment();
    const { service } = clickSetup(payment);
    const body = { ...signed({ merchant_trans_id: payment.id }), sign_string: 'deadbeef' };
    expect((await service.prepare(body)).error).toBe(ClickError.SignCheckFailed);
  });

  it('refuses a callback signed with the wrong secret', async () => {
    const payment = clickPayment();
    const { service } = clickSetup(payment);
    const body = signed({ merchant_trans_id: payment.id });
    body.sign_string = clickSignature({
      clickTransId: body.click_trans_id,
      serviceId: body.service_id,
      secretKey: 'not-our-secret',
      merchantTransId: body.merchant_trans_id,
      merchantPrepareId: body.merchant_prepare_id,
      amount: body.amount,
      action: body.action,
      signTime: body.sign_time,
    });
    expect((await service.prepare(body)).error).toBe(ClickError.SignCheckFailed);
  });

  it('refuses an amount that was tampered with after signing', async () => {
    const payment = clickPayment();
    const { service } = clickSetup(payment);
    const body = { ...signed({ merchant_trans_id: payment.id }), amount: '1000.00' };
    // The digest no longer matches, so this never reaches the amount check.
    expect((await service.prepare(body)).error).toBe(ClickError.SignCheckFailed);
  });

  it('refuses an amount that is signed but wrong', async () => {
    const payment = clickPayment();
    const { service } = clickSetup(payment);
    const body = signed({ merchant_trans_id: payment.id, amount: '1000.00' });
    expect((await service.prepare(body)).error).toBe(ClickError.IncorrectAmount);
  });

  it('refuses another merchant’s service id', async () => {
    const payment = clickPayment();
    const { service } = clickSetup(payment);
    const body = signed({ merchant_trans_id: payment.id, service_id: '99999' });
    expect((await service.prepare(body)).error).toBe(ClickError.BadRequest);
  });

  it('refuses an unknown order', async () => {
    const { service } = clickSetup();
    const body = signed({ merchant_trans_id: '3f2f1a10-0000-4000-8000-999999999999' });
    expect((await service.prepare(body)).error).toBe(ClickError.TransactionNotFound);
  });

  it('will not touch a payment belonging to the other provider', async () => {
    const payment = aPayment({ provider: 'payme' });
    const { service } = clickSetup(payment);
    const body = signed({ merchant_trans_id: payment.id });
    expect((await service.prepare(body)).error).toBe(ClickError.TransactionNotFound);
  });

  it('refuses an order already paid or cancelled', async () => {
    const paid = clickPayment({ status: 'paid' });
    const cancelled = clickPayment({ status: 'cancelled' });
    const { service } = clickSetup(paid, cancelled);
    expect((await service.prepare(signed({ merchant_trans_id: paid.id }))).error).toBe(
      ClickError.AlreadyPaid,
    );
    expect((await service.prepare(signed({ merchant_trans_id: cancelled.id }))).error).toBe(
      ClickError.TransactionCancelled,
    );
  });

  it('refuses when Click reports its own failure', async () => {
    const payment = clickPayment();
    const { billing, service } = clickSetup(payment);
    const body = signed({ merchant_trans_id: payment.id, error: -5 });
    expect((await service.prepare(body)).error).toBe(ClickError.TransactionCancelled);
    expect(billing.activations).toBe(0);
  });

  it('refuses a Complete sent to Prepare', async () => {
    const payment = clickPayment();
    const { service } = clickSetup(payment);
    const body = signed({ merchant_trans_id: payment.id, action: ClickAction.Complete });
    expect((await service.prepare(body)).error).toBe(ClickError.ActionNotFound);
  });
});

describe('complete', () => {
  /** Run a real Prepare first, so the ids and the signature line up. */
  async function prepared(overrides: Parameters<typeof aPayment>[0] = {}) {
    const payment = clickPayment(overrides);
    const { billing, service } = clickSetup(payment);
    const prepare = await service.prepare(signed({ merchant_trans_id: payment.id }));
    const complete = (over: Partial<ClickCallback> = {}) =>
      signed({
        merchant_trans_id: payment.id,
        merchant_prepare_id: String(prepare.merchant_prepare_id),
        action: ClickAction.Complete,
        ...over,
      });
    return { payment, billing, service, prepare, complete };
  }

  it('grants the period and confirms', async () => {
    const { billing, service, complete, prepare } = await prepared();
    const result = await service.complete(complete());
    expect(result.error).toBe(ClickError.Success);
    expect(result.merchant_confirm_id).toBe(prepare.merchant_prepare_id);
    expect(billing.activations).toBe(1);
  });

  it('grants ONCE however many times Click asks', async () => {
    const { billing, service, complete } = await prepared();
    await service.complete(complete());
    const again = await service.complete(complete());
    expect(billing.activations).toBe(1);
    expect(again.error).toBe(ClickError.AlreadyPaid);
  });

  it('refuses a Complete quoting a prepare id we never issued', async () => {
    const { service, complete, billing } = await prepared();
    // Signed correctly, but for a different prepare id — so the signature
    // verifies and the check that catches it is the stored-id comparison.
    const result = await service.complete(complete({ merchant_prepare_id: '999999999' }));
    expect(result.error).toBe(ClickError.TransactionNotFound);
    expect(billing.activations).toBe(0);
  });

  it('cancels when Click reports the payment failed', async () => {
    const { billing, service, complete } = await prepared();
    const result = await service.complete(complete({ error: -9 }));
    expect(result.error).toBe(ClickError.TransactionCancelled);
    expect(billing.activations).toBe(0);
    expect(billing.cancellations).toBe(1);
    expect(billing.payments.get([...billing.payments.keys()][0]!)?.status).toBe('cancelled');
  });

  it('refuses a Prepare sent to Complete', async () => {
    const { service, complete } = await prepared();
    expect((await service.complete(complete({ action: ClickAction.Prepare }))).error).toBe(
      ClickError.ActionNotFound,
    );
  });

  it('refuses a Complete for an order that was never prepared', async () => {
    const payment = clickPayment();
    const { billing, service } = clickSetup(payment);
    const body = signed({
      merchant_trans_id: payment.id,
      merchant_prepare_id: '123456',
      action: ClickAction.Complete,
    });
    expect((await service.complete(body)).error).toBe(ClickError.TransactionNotFound);
    expect(billing.activations).toBe(0);
  });
});

/**
 * What the product does on a deployment where the merchant accounts do not
 * exist yet — which is the state it ships in before Payme and Click have
 * issued any credentials.
 */
describe('checkout with an unconfigured provider', () => {
  /** A TenantDb that records whether anything reached the database at all. */
  function dbSpy() {
    const spy = { touched: false };
    const db = {
      tx: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
        spy.touched = true;
        return fn({});
      },
    };
    return { spy, db };
  }

  beforeAll(() => {
    // No merchant has been signed up, so nothing is set.
    env.PAYME_MERCHANT_ID = undefined;
    env.CLICK_MERCHANT_ID = undefined;
  });

  it('refuses with 503 rather than opening a payment nobody can complete', async () => {
    const { RealBillingService } = await import('./billing.service.js').then((m) => ({
      RealBillingService: m.BillingService,
    }));
    for (const provider of ['payme', 'click'] as const) {
      const { spy, db } = dbSpy();
      const billing = new RealBillingService(db as never);
      const error = await billing
        .checkout({ plan: 'personal', provider, months: 1 })
        .then(() => null, (e: unknown) => e as { status?: number });

      expect(error, provider).not.toBeNull();
      expect(error?.status, provider).toBe(503);
      // And nothing was written: an abandoned pending row per button press is
      // exactly what a deployment without credentials would otherwise collect.
      expect(spy.touched, provider).toBe(false);
    }
  });
});
