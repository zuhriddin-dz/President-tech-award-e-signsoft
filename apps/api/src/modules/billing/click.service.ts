import { Injectable, Logger } from '@nestjs/common';
import { sumFromTiyin } from '@docflow/contracts';
import type { Payment } from '@docflow/db';
import { env } from '../../config/env.js';
import { PaymentResolver } from '../../tenant/payment.resolver.js';
import { BillingService } from './billing.service.js';
import {
  ClickAction,
  ClickError,
  clickAmountMatches,
  clickNote,
  clickSignature,
  clickSignatureValid,
  type ClickCallback,
} from './click.protocol.js';

/** What the merchant returns to Click. Always alongside HTTP 200. */
export interface ClickResult {
  error: number;
  error_note: string;
  merchant_prepare_id?: number;
  merchant_confirm_id?: number;
}

const ok = (extra: Omit<ClickResult, 'error' | 'error_note'> = {}): ClickResult => ({
  error: ClickError.Success,
  error_note: clickNote(ClickError.Success),
  ...extra,
});

const fail = (code: number): ClickResult => ({ error: code, error_note: clickNote(code) });

/**
 * Click's two-step callback.
 *
 * Prepare asks whether an order is real and correctly priced; Complete says
 * the money moved. Between them Click carries an integer of ours — the
 * merchant_prepare_id — and quoting it back is what ties the two halves
 * together, so a Complete that names an id we never issued is refused.
 *
 * The signature is checked before anything else on both calls. It is the only
 * evidence that a request came from Click at all: these routes are open to the
 * internet, the fields are guessable, and without the shared secret nobody can
 * produce the digest.
 */
@Injectable()
export class ClickService {
  private readonly log = new Logger(ClickService.name);

  constructor(
    private readonly resolver: PaymentResolver,
    private readonly billing: BillingService,
  ) {}

  async prepare(body: ClickCallback): Promise<ClickResult> {
    const guard = await this.verified(body, ClickAction.Prepare);
    if ('error' in guard) return guard.error;
    const payment = guard.payment;

    // Click telling us the payment already failed on its side.
    if (body.error < 0) return fail(ClickError.TransactionCancelled);

    if (payment.status === 'paid') return fail(ClickError.AlreadyPaid);
    if (payment.status === 'cancelled') return fail(ClickError.TransactionCancelled);

    // A retried Prepare must answer with the id it issued the first time:
    // Click signs Complete with that value, so inventing a new one here would
    // make the Complete signature fail to verify.
    const prepareId = payment.clickPrepareId ?? newPrepareId();
    if (payment.clickPrepareId === null) {
      await this.billing.attachClickPrepareId(payment.id, prepareId);
    }
    await this.billing.attachProviderTxn(payment.id, body.click_trans_id, new Date());

    return ok({ merchant_prepare_id: prepareId });
  }

  async complete(body: ClickCallback): Promise<ClickResult> {
    const guard = await this.verified(body, ClickAction.Complete);
    if ('error' in guard) return guard.error;
    const payment = guard.payment;

    // Complete must quote the id Prepare issued, and nothing else.
    const quoted = Number(body.merchant_prepare_id);
    if (
      payment.clickPrepareId === null ||
      !Number.isInteger(quoted) ||
      quoted !== payment.clickPrepareId
    ) {
      return fail(ClickError.TransactionNotFound);
    }

    // Click reporting its own failure: the money did not move, so the order is
    // closed rather than granted.
    if (body.error < 0) {
      await this.billing.cancel(payment.id, body.error, new Date());
      return fail(ClickError.TransactionCancelled);
    }

    if (payment.status === 'cancelled') return fail(ClickError.TransactionCancelled);
    // Click's documented answer for a Complete it has already had. Access was
    // granted the first time; this is a repeat, not a second purchase.
    if (payment.status === 'paid') return fail(ClickError.AlreadyPaid);

    await this.billing.activate(payment.id, new Date());
    return ok({
      merchant_prepare_id: payment.clickPrepareId,
      merchant_confirm_id: payment.clickPrepareId,
    });
  }

  /**
   * Everything both calls must establish before they may touch a payment: the
   * request is from Click, it is for our service, it names a Click payment of
   * ours, and the amount is the one that payment costs.
   */
  private async verified(
    body: ClickCallback,
    action: number,
  ): Promise<{ payment: Payment } | { error: ClickResult }> {
    const secret = env.CLICK_SECRET_KEY;
    const serviceId = env.CLICK_SERVICE_ID;
    if (!secret || !serviceId) {
      this.log.error('click callback received but Click is not configured');
      return { error: fail(ClickError.BadRequest) };
    }

    if (body.action !== action) return { error: fail(ClickError.ActionNotFound) };
    if (body.service_id !== serviceId) return { error: fail(ClickError.BadRequest) };

    const expected = clickSignature({
      clickTransId: body.click_trans_id,
      serviceId: body.service_id,
      secretKey: secret,
      merchantTransId: body.merchant_trans_id,
      // Signed as sent: empty on Prepare, the issued id on Complete.
      merchantPrepareId: body.merchant_prepare_id,
      amount: body.amount,
      action: body.action,
      signTime: body.sign_time,
    });
    if (!clickSignatureValid(body.sign_string, expected)) {
      return { error: fail(ClickError.SignCheckFailed) };
    }

    if (!(await this.resolver.resolve(body.merchant_trans_id))) {
      return { error: fail(ClickError.TransactionNotFound) };
    }
    const payment = await this.billing.find(body.merchant_trans_id, 'click');
    if (!payment) return { error: fail(ClickError.TransactionNotFound) };

    // The amount check is what stops a customer editing the price on the way
    // to the checkout page. Click quotes so'm; the order is stored in tiyin.
    if (!clickAmountMatches(body.amount, sumFromTiyin(payment.amountTiyin))) {
      return { error: fail(ClickError.IncorrectAmount) };
    }

    return { payment };
  }
}

/**
 * The integer handed to Click at Prepare. Any positive value it can carry
 * through to Complete will do — it is compared against what we stored, not
 * interpreted — so it is random rather than sequential, which keeps it from
 * leaking how many payments the product has taken. Kept well inside a signed
 * 32-bit integer, which is the column's width.
 */
function newPrepareId(): number {
  return Math.floor(Math.random() * 1_000_000_000) + 1;
}
