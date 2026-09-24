import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from './tenant-context.js';

/**
 * Resolve a payment id presented by a PAYMENT PROVIDER to its tenant, and
 * enter tenant context — the fail-closed entry point for the Payme and Click
 * callbacks, and a sanctioned SESSIONLESS CLS tenant writer (security-lint
 * exempts this folder).
 *
 * Same shape, and same reasoning, as SigningTokenResolver: a caller outside
 * every workspace presents one opaque identifier, and the tenant comes from
 * LOOKING IT UP rather than from anything the caller claims. resolve_payment
 * is SECURITY DEFINER because RLS context does not exist yet, and it takes the
 * id as text so a provider posting nonsense gets "no such order" instead of a
 * 500 from a failed uuid cast.
 *
 * THE CALLER IS NOT DONE: this only says which tenant to open. The billing
 * service must then load the payment under RLS and check its provider, its
 * amount and its status before acting — a resolution on its own authorizes
 * nothing, and in particular does not mean the payment is payable.
 */
@Injectable()
export class PaymentResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContext,
  ) {}

  /** True when the payment exists and tenant context is now open for it. */
  async resolve(paymentId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ tenant_id: string }[]>`
      SELECT tenant_id FROM public.resolve_payment(${paymentId})`;
    const row = rows[0];
    if (!row) return false;
    this.context.enterAsPaymentCallback(row.tenant_id);
    return true;
  }

  /**
   * The same thing, by the PROVIDER's own transaction id, and returning which
   * payment it found.
   *
   * Payme names our order exactly once, in CreateTransaction; Perform, Cancel
   * and Check all identify the transaction by Payme's id alone. The provider
   * is part of the lookup so one provider's identifier can never resolve
   * another's payment.
   */
  async resolveByTxn(provider: string, txnId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ tenant_id: string; payment_id: string }[]>`
      SELECT tenant_id, payment_id FROM public.resolve_payment_by_txn(${provider}, ${txnId})`;
    const row = rows[0];
    if (!row) return null;
    this.context.enterAsPaymentCallback(row.tenant_id);
    return row.payment_id;
  }

  /**
   * Payme's reconciliation window. Cross-tenant by necessity — Payme asks
   * about a period, not a workspace — and narrowed in SQL to Payme rows and
   * the statement's own fields. No tenant context is entered, because there is
   * no single tenant this belongs to.
   */
  async paymeStatement(from: Date, to: Date): Promise<PaymeStatementRow[]> {
    return this.prisma.$queryRaw<PaymeStatementRow[]>`
      SELECT payment_id, provider_txn_id, amount_tiyin, provider_created_at,
             paid_at, cancelled_at, cancel_reason, status
      FROM public.payme_statement(${from}, ${to})`;
  }
}

export interface PaymeStatementRow {
  payment_id: string;
  provider_txn_id: string;
  amount_tiyin: number;
  provider_created_at: Date;
  paid_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: number | null;
  status: string;
}
