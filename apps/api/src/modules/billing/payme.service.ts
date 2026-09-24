import { Injectable } from '@nestjs/common';
import type { Payment } from '@docflow/db';
import { env } from '../../config/env.js';
import { PaymentResolver } from '../../tenant/payment.resolver.js';
import { BillingService } from './billing.service.js';
import {
  PAYME_TRANSACTION_TIMEOUT_MS,
  PaymeError,
  PaymeRpcError,
  PaymeState,
} from './payme.protocol.js';

/**
 * The six Merchant API methods Payme calls on us.
 *
 * Two things shape everything here.
 *
 * FIRST, every method is idempotent, because Payme retries. It repeats a call
 * until it gets an answer it understands, so the second CreateTransaction for
 * an order must return the same transaction the first one did, and the second
 * PerformTransaction must report the same perform_time — not create a second
 * transaction or grant a second month. Where a retry is indistinguishable from
 * the original, it is answered identically rather than refused.
 *
 * SECOND, timestamps go back out exactly as they were recorded. Payme compares
 * create_time and perform_time across calls, so they are stored when they
 * first happen and read back afterwards, never recomputed from the clock.
 */
@Injectable()
export class PaymeService {
  constructor(
    private readonly resolver: PaymentResolver,
    private readonly billing: BillingService,
  ) {}

  /** May this order be paid, for this amount? Nothing is written. */
  async checkPerformTransaction(params: PaymeParams): Promise<{ allow: true }> {
    const payment = await this.byAccount(params);
    this.requirePayable(payment);
    this.requireAmount(payment, params.amount);
    return { allow: true };
  }

  async createTransaction(params: PaymeParams): Promise<PaymeCreateResult> {
    const id = requireString(params.id, PaymeError.InvalidRequest);
    const time = requireNumber(params.time, PaymeError.InvalidRequest);
    const payment = await this.byAccount(params);

    if (payment.providerTxnId) {
      // Payme repeating itself: answer with the transaction it already has.
      if (payment.providerTxnId === id && payment.providerCreatedAt) {
        this.requireNotTimedOut(payment.providerCreatedAt);
        return {
          create_time: payment.providerCreatedAt.getTime(),
          transaction: payment.id,
          state: PaymeState.Created,
        };
      }
      // A DIFFERENT Payme transaction against an order that already has one.
      // Only one may be open at a time, so this is refused rather than allowed
      // to race the first to completion.
      throw new PaymeRpcError(PaymeError.CannotPerform);
    }

    this.requirePayable(payment);
    this.requireAmount(payment, params.amount);
    this.requireNotTimedOut(new Date(time));

    await this.billing.attachProviderTxn(payment.id, id, new Date(time));
    return { create_time: time, transaction: payment.id, state: PaymeState.Created };
  }

  async performTransaction(params: PaymeParams): Promise<PaymePerformResult> {
    const payment = await this.byTxn(params);

    if (payment.status === 'paid' && payment.paidAt) {
      // Already done — report the original time, not a new one.
      return {
        transaction: payment.id,
        perform_time: payment.paidAt.getTime(),
        state: PaymeState.Performed,
      };
    }
    if (payment.status === 'cancelled') throw new PaymeRpcError(PaymeError.CannotPerform);
    if (payment.providerCreatedAt) this.requireNotTimedOut(payment.providerCreatedAt);

    const now = new Date();
    await this.billing.activate(payment.id, now);
    return {
      transaction: payment.id,
      perform_time: now.getTime(),
      state: PaymeState.Performed,
    };
  }

  async cancelTransaction(params: PaymeParams): Promise<PaymeCancelResult> {
    const payment = await this.byTxn(params);
    const reason = typeof params.reason === 'number' ? params.reason : null;

    if (payment.status === 'cancelled' && payment.cancelledAt) {
      return {
        transaction: payment.id,
        cancel_time: payment.cancelledAt.getTime(),
        state: cancelledState(payment),
      };
    }

    // Which cancelled state this becomes depends on whether the money had
    // already moved, so it is decided BEFORE the status changes.
    const state =
      payment.status === 'paid'
        ? PaymeState.CancelledAfterPerform
        : PaymeState.CancelledBeforePerform;

    const now = new Date();
    await this.billing.cancel(payment.id, reason, now);
    return { transaction: payment.id, cancel_time: now.getTime(), state };
  }

  async checkTransaction(params: PaymeParams): Promise<PaymeCheckResult> {
    const payment = await this.byTxn(params);
    return {
      create_time: payment.providerCreatedAt?.getTime() ?? 0,
      perform_time: payment.paidAt?.getTime() ?? 0,
      cancel_time: payment.cancelledAt?.getTime() ?? 0,
      transaction: payment.id,
      state: stateOf(payment),
      reason: payment.cancelReason ?? null,
    };
  }

  /** Every Payme transaction in a window, for Payme to reconcile against. */
  async getStatement(params: PaymeParams): Promise<{ transactions: PaymeStatementEntry[] }> {
    const from = requireNumber(params.from, PaymeError.InvalidRequest);
    const to = requireNumber(params.to, PaymeError.InvalidRequest);

    const rows = await this.resolver.paymeStatement(new Date(from), new Date(to));
    return {
      transactions: rows.map((r) => ({
        id: r.provider_txn_id,
        time: r.provider_created_at.getTime(),
        amount: r.amount_tiyin,
        account: { [env.PAYME_ACCOUNT_FIELD]: r.payment_id },
        create_time: r.provider_created_at.getTime(),
        perform_time: r.paid_at?.getTime() ?? 0,
        cancel_time: r.cancelled_at?.getTime() ?? 0,
        transaction: r.payment_id,
        state:
          r.status === 'paid'
            ? PaymeState.Performed
            : r.status === 'cancelled'
              ? r.paid_at
                ? PaymeState.CancelledAfterPerform
                : PaymeState.CancelledBeforePerform
              : PaymeState.Created,
        reason: r.cancel_reason ?? null,
        receivers: null,
      })),
    };
  }

  /**
   * Find the payment named by `account`, and open its tenant.
   *
   * The account field name is whatever the Payme cabinet is configured with;
   * a mismatch here makes every real payment look like an unknown order, which
   * is why the error names the field it looked for.
   */
  private async byAccount(params: PaymeParams): Promise<Payment> {
    const field = env.PAYME_ACCOUNT_FIELD;
    const account = params.account;
    const orderId =
      account && typeof account === 'object' ? (account as Record<string, unknown>)[field] : null;

    if (typeof orderId !== 'string' || !orderId) {
      throw new PaymeRpcError(PaymeError.OrderNotFound, field);
    }
    if (!(await this.resolver.resolve(orderId))) {
      throw new PaymeRpcError(PaymeError.OrderNotFound, field);
    }
    const payment = await this.billing.find(orderId, 'payme');
    if (!payment) throw new PaymeRpcError(PaymeError.OrderNotFound, field);
    return payment;
  }

  /** Find the payment by PAYME's transaction id, and open its tenant. */
  private async byTxn(params: PaymeParams): Promise<Payment> {
    const id = requireString(params.id, PaymeError.TransactionNotFound);
    const paymentId = await this.resolver.resolveByTxn('payme', id);
    if (!paymentId) throw new PaymeRpcError(PaymeError.TransactionNotFound);
    const payment = await this.billing.find(paymentId, 'payme');
    if (!payment) throw new PaymeRpcError(PaymeError.TransactionNotFound);
    return payment;
  }

  private requirePayable(payment: Payment): void {
    if (payment.status !== 'pending') throw new PaymeRpcError(PaymeError.OrderNotPayable);
  }

  /**
   * The amount Payme quotes must be the amount the order costs, to the tiyin.
   * This is the check that stops a customer editing the amount on the way to
   * the checkout page and buying a month for a hundred so'm.
   */
  private requireAmount(payment: Payment, amount: unknown): void {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new PaymeRpcError(PaymeError.InvalidAmount);
    }
    if (Math.trunc(amount) !== payment.amountTiyin) {
      throw new PaymeRpcError(PaymeError.InvalidAmount);
    }
  }

  /**
   * Payme will not leave a transaction open indefinitely, and neither do we:
   * past the timeout it is stale, and performing it would take money for a
   * checkout the customer abandoned half a day ago.
   */
  private requireNotTimedOut(createdAt: Date): void {
    if (Date.now() - createdAt.getTime() > PAYME_TRANSACTION_TIMEOUT_MS) {
      throw new PaymeRpcError(PaymeError.CannotPerform);
    }
  }
}

function stateOf(payment: Payment): number {
  if (payment.status === 'paid') return PaymeState.Performed;
  if (payment.status === 'cancelled') return cancelledState(payment);
  return PaymeState.Created;
}

/** A cancellation AFTER the money moved is a refund, and Payme numbers it -2. */
function cancelledState(payment: Payment): number {
  return payment.paidAt ? PaymeState.CancelledAfterPerform : PaymeState.CancelledBeforePerform;
}

function requireString(value: unknown, code: number): string {
  if (typeof value !== 'string' || !value) throw new PaymeRpcError(code);
  return value;
}

function requireNumber(value: unknown, code: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new PaymeRpcError(code);
  return value;
}

export type PaymeParams = Record<string, unknown>;

interface PaymeCreateResult {
  create_time: number;
  transaction: string;
  state: number;
}
interface PaymePerformResult {
  transaction: string;
  perform_time: number;
  state: number;
}
interface PaymeCancelResult {
  transaction: string;
  cancel_time: number;
  state: number;
}
interface PaymeCheckResult {
  create_time: number;
  perform_time: number;
  cancel_time: number;
  transaction: string;
  state: number;
  reason: number | null;
}
interface PaymeStatementEntry {
  id: string;
  time: number;
  amount: number;
  account: Record<string, string>;
  create_time: number;
  perform_time: number;
  cancel_time: number;
  transaction: string;
  state: number;
  reason: number | null;
  receivers: null;
}
