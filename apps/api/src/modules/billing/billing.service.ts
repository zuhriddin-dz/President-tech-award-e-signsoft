import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  sumFromTiyin,
  type CheckoutRequest,
  type CheckoutResponse,
  type Payment as PaymentWire,
  type PaymentList,
  type PaymentProvider,
} from '@docflow/contracts';
import type { Payment } from '@docflow/db';
import { env } from '../../config/env.js';
import { TenantDb } from '../../tenant/tenant-db.js';
import { grantedPeriod, priceTiyin } from './billing.math.js';
import { clickPayUrl } from './click.protocol.js';
import { paymeCheckoutUrl } from './payme.protocol.js';

/**
 * Everything both payment providers share: opening a purchase, turning a
 * completed one into access, and taking that access back if it is reversed.
 *
 * The provider adapters own their wire protocols and NOTHING else. Granting
 * time lives here, once, because two implementations of "what did this buy"
 * would eventually disagree, and the disagreement would be a customer paying
 * for a month and receiving a different one.
 *
 * Every method assumes tenant context is already open — from a session for
 * checkout, from PaymentResolver for a callback — so RLS is what scopes these
 * queries, not a tenant id passed around as an argument.
 */
@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(private readonly db: TenantDb) {}

  /**
   * Open a purchase: write the pending row FIRST, then build the URL that
   * sends the customer to the provider.
   *
   * That order is not an accident. The provider identifies the purchase by
   * this row's id and may call back about it at any moment after the customer
   * arrives — including before the browser has finished redirecting. A row
   * that only appeared after a successful redirect would be missing exactly
   * when the first callback asked for it.
   */
  async checkout(body: CheckoutRequest): Promise<CheckoutResponse> {
    const amountTiyin = priceTiyin(body.plan, body.months);

    // Resolve the provider's configuration BEFORE writing anything. The row
    // below is a real open purchase, and a provider we cannot even address
    // would leave one behind on every attempt — on a deployment whose
    // credentials are not set yet, that is one abandoned row per button press
    // and no way to pay any of them.
    const buildUrl = this.urlBuilderFor(body.provider);

    const payment = await this.db.tx((tx) =>
      tx.payment.create({
        // tenant_id is stamped by the database from the RLS context, exactly
        // like every other tenant-owned row.
        data: { plan: body.plan, provider: body.provider, amountTiyin, months: body.months },
        select: { id: true },
      }),
    );

    return { paymentId: payment.id, payUrl: buildUrl(payment.id, amountTiyin), amountTiyin };
  }

  /** The workspace's payment history, newest first. */
  async history(): Promise<PaymentList> {
    const rows = await this.db.tx((tx) =>
      tx.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    );
    return { payments: rows.map(toWire) };
  }

  /**
   * Find a payment this provider may act on, under RLS.
   *
   * The provider check matters: a payment id is not a secret, and without it a
   * Click callback quoting a Payme order id would be allowed to complete it.
   * Returns null rather than throwing so each adapter can answer in its own
   * protocol's idea of "no such order".
   */
  async find(paymentId: string, provider: PaymentProvider): Promise<Payment | null> {
    const payment = await this.db.tx((tx) => tx.payment.findUnique({ where: { id: paymentId } }));
    if (!payment || payment.provider !== provider) return null;
    return payment;
  }

  /** Record which transaction on the provider's side this payment belongs to. */
  async attachProviderTxn(
    paymentId: string,
    providerTxnId: string,
    providerCreatedAt: Date,
  ): Promise<void> {
    await this.db.tx((tx) =>
      tx.payment.update({ where: { id: paymentId }, data: { providerTxnId, providerCreatedAt } }),
    );
  }

  /** Issue the integer Click is handed at Prepare and must quote back at Complete. */
  async attachClickPrepareId(paymentId: string, clickPrepareId: number): Promise<void> {
    await this.db.tx((tx) =>
      tx.payment.update({ where: { id: paymentId }, data: { clickPrepareId } }),
    );
  }

  /**
   * The money arrived: mark the payment paid and extend the workspace.
   *
   * Idempotent, because BOTH providers retry. Payme repeats PerformTransaction
   * until it gets an answer it likes, and Click will resend Complete; either
   * one arriving twice must grant one period, not two. The compare-and-set on
   * `status` is what guarantees that — the second caller updates no rows and
   * is told the payment was already settled.
   *
   * Returns false when there was nothing to do, which both adapters treat as
   * success: the provider is asking whether the money landed, and it did.
   */
  async activate(paymentId: string, now: Date): Promise<boolean> {
    return this.db.tx(async (tx) => {
      // Lock the workspace first. Two payments completing at the same moment
      // would otherwise both read the same paid_until and both extend from it,
      // and the customer would have paid twice for one period.
      //
      // No tenant id is named, here or below: under RLS the only visible
      // tenant IS ours, so the query is its own isolation proof — the same
      // reasoning as the findMany in /me.
      await tx.$queryRaw`SELECT paid_until FROM tenants FOR UPDATE`;

      // Compare-and-set: only a pending payment becomes paid, and only once.
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'pending' },
        data: { status: 'paid', paidAt: now },
      });
      if (claimed.count === 0) return false;

      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const tenant = await tx.tenant.findFirstOrThrow({ select: { paidUntil: true } });

      const { start, end } = grantedPeriod(tenant.paidUntil, payment.months, now);
      await tx.tenant.updateMany({ data: { plan: 'pro', paidUntil: end } });
      await tx.payment.update({
        where: { id: paymentId },
        data: { periodStart: start, periodEnd: end },
      });

      this.log.log(
        { paymentId, months: payment.months, paidUntil: end.toISOString() },
        'payment activated',
      );
      return true;
    });
  }

  /**
   * The payment was reversed: cancel it, and take back what it granted.
   *
   * A cancellation before the money moved is bookkeeping. One AFTER is a
   * refund, and leaving the workspace with time it was refunded for would mean
   * giving the product away to anyone willing to pay and immediately reverse.
   *
   * The clawback is deliberately conservative: the granted period is removed
   * only when nothing has extended the workspace since — that is, when
   * paid_until is still exactly where this payment left it. If a later payment
   * has moved it on, the arithmetic of unpicking one period from the middle of
   * a stack is guesswork, so the row is cancelled, the discrepancy is logged
   * loudly, and a person decides.
   */
  async cancel(paymentId: string, reason: number | null, now: Date): Promise<void> {
    await this.db.tx(async (tx) => {
      await tx.$queryRaw`SELECT paid_until FROM tenants FOR UPDATE`;

      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: ['pending', 'paid'] } },
        data: { status: 'cancelled', cancelledAt: now, cancelReason: reason },
      });
      if (claimed.count === 0) return;

      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      // Nothing was granted, so there is nothing to take back.
      if (!payment.periodEnd || !payment.periodStart) return;

      const tenant = await tx.tenant.findFirstOrThrow({ select: { paidUntil: true } });

      if (tenant.paidUntil?.getTime() === payment.periodEnd.getTime()) {
        await tx.tenant.updateMany({ data: { paidUntil: payment.periodStart } });
        this.log.warn({ paymentId, reason }, 'payment reversed; granted period removed');
        return;
      }

      this.log.error(
        {
          paymentId,
          reason,
          grantedUntil: payment.periodEnd.toISOString(),
          workspacePaidUntil: tenant.paidUntil?.toISOString() ?? null,
        },
        'payment reversed but the workspace was extended since — paid_until left alone, needs a human',
      );
    });
  }

  /**
   * Check the provider is configured and hand back something that can build
   * its URL, so the caller can refuse before it writes.
   *
   * An unconfigured provider is a 503, not a 400: nothing is wrong with the
   * request, we simply cannot take money through that provider on this
   * deployment. The Get Pro page reads that status and says so, rather than
   * sending the customer to a page that will not load.
   */
  private urlBuilderFor(provider: PaymentProvider): (id: string, amountTiyin: number) => string {
    if (provider === 'payme') {
      const merchantId = env.PAYME_MERCHANT_ID;
      if (!merchantId) throw new ServiceUnavailableException('Payme is not configured.');
      return (paymentId, amountTiyin) =>
        paymeCheckoutUrl({
          checkoutOrigin: env.PAYME_CHECKOUT_URL,
          merchantId,
          accountField: env.PAYME_ACCOUNT_FIELD,
          paymentId,
          amountTiyin,
          returnUrl: this.returnUrl(),
        });
    }

    const { CLICK_MERCHANT_ID: merchantId, CLICK_SERVICE_ID: serviceId } = env;
    if (!merchantId || !serviceId) throw new ServiceUnavailableException('Click is not configured.');
    return (paymentId, amountTiyin) =>
      clickPayUrl({
        checkoutUrl: env.CLICK_CHECKOUT_URL,
        serviceId,
        merchantId,
        paymentId,
        // Click quotes so'm; we store tiyin. The one conversion in the product.
        amountSum: sumFromTiyin(amountTiyin),
        returnUrl: this.returnUrl(),
      });
  }

  /** Where the provider sends the customer afterwards, when we know. */
  private returnUrl(): string | null {
    return env.WEB_APP_URL ? `${env.WEB_APP_URL.replace(/\/+$/, '')}/billing` : null;
  }
}

function toWire(p: Payment): PaymentWire {
  return {
    id: p.id,
    plan: p.plan,
    provider: p.provider,
    status: p.status,
    amountTiyin: p.amountTiyin,
    months: p.months,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null,
    periodEnd: p.periodEnd?.toISOString() ?? null,
  };
}
