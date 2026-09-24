-- Billing: a payments ledger, a paid-until date on the workspace, and the one
-- SECURITY DEFINER lookup a payment callback needs before it has any tenant.
--
-- Money is stored in TIYIN as an integer. Never so'm, and never a float: both
-- providers compare the amount they quoted against the amount we confirm and
-- refuse the payment when they differ, so a fraction of a tiyin is not a
-- cosmetic rounding question here.

-- CreateEnum
CREATE TYPE "billing_plan" AS ENUM ('personal', 'company');
CREATE TYPE "payment_provider" AS ENUM ('payme', 'click');
CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'cancelled');

-- AlterTable
-- End of the PAID period. NULL means the workspace has never paid — including
-- one granted `pro` by hand, which is why the application treats NULL as "does
-- not lapse" rather than as a date infinitely far in the past.
ALTER TABLE "tenants" ADD COLUMN "paid_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid,
    "plan" "billing_plan" NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "amount_tiyin" INTEGER NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "provider_txn_id" TEXT,
    "provider_created_at" TIMESTAMP(3),
    "click_prepare_id" INTEGER,
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" INTEGER,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- A payment is for a positive amount of money and a positive number of months.
-- Stated in the database because this is the value the callbacks compare
-- against, and a zero-amount row would make every amount check trivially pass.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_tiyin" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_months_positive" CHECK ("months" > 0);

-- CreateIndex
-- One provider transaction maps to at most one payment, so a callback replayed
-- (or a second transaction opened against the same order) can never be taken
-- for a separate purchase and granted a second period. NULLs are distinct in
-- Postgres, so the many pending rows that have no provider id yet do not
-- collide with each other.
CREATE UNIQUE INDEX "payments_provider_provider_txn_id_key" ON "payments"("provider", "provider_txn_id");
CREATE INDEX "payments_tenant_id_created_at_idx" ON "payments"("tenant_id", "created_at");

-- RLS — payments are tenant data like everything else. Fail-closed: with no
-- app.tenant_id set the predicate is NULL and no row is visible, which is what
-- makes it safe that the callback routes are reachable by the whole internet.
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "payments"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "payments" TO docflow_app;

-- Which workspace does this payment belong to?
--
-- A payment callback arrives from Payme or Click with nothing but the order id
-- we gave them. There is no session and therefore no RLS context yet, so the
-- lookup has to run as the definer — the same shape as resolve_signing_token,
-- and for the same reason.
--
-- It is deliberately minimal, and RESOLVING AUTHORIZES NOTHING. It says only
-- which tenant to open; the caller then enters that tenant's context and
-- re-reads the payment under RLS to check the amount, the status and the
-- provider before acting on it.
--
-- The id arrives as text because a provider may send anything at all in that
-- field. A malformed value returns no rows — "no such order" — rather than
-- raising, so a stray callback cannot turn into a 500.
CREATE FUNCTION public.resolve_payment(p_payment_id text)
RETURNS TABLE(tenant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_id uuid;
BEGIN
  BEGIN
    v_id := p_payment_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN;
  END;
  RETURN QUERY SELECT p.tenant_id FROM payments p WHERE p.id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_payment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_payment(text) TO docflow_app;

-- The same lookup, by the PROVIDER's transaction id.
--
-- Payme names our order only once, in CreateTransaction. Every call after that
-- — Perform, Cancel, Check — identifies the transaction by Payme's own id and
-- nothing else, so without this there is no way back to a tenant. Narrowed by
-- provider so one provider's id can never resolve another's payment.
CREATE FUNCTION public.resolve_payment_by_txn(p_provider text, p_txn_id text)
RETURNS TABLE(tenant_id uuid, payment_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.tenant_id, p.id
  FROM payments p
  WHERE p.provider::text = p_provider
    AND p.provider_txn_id = p_txn_id;
$$;

REVOKE ALL ON FUNCTION public.resolve_payment_by_txn(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_payment_by_txn(text, text) TO docflow_app;

-- Payme's GetStatement: every Payme transaction in a window, for reconciliation.
--
-- This one is deliberately CROSS-TENANT, which nothing else in the product is.
-- It has to be: Payme reconciles its own ledger against ours and asks about a
-- period, not about a workspace. The exposure is kept to the narrowest thing
-- that answers the question — Payme rows only, and only the fields that appear
-- in the statement. No customer, workspace or document data is reachable
-- through it, and the route that calls it is behind the merchant key.
CREATE FUNCTION public.payme_statement(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(
  payment_id uuid,
  provider_txn_id text,
  amount_tiyin integer,
  provider_created_at timestamp,
  paid_at timestamp,
  cancelled_at timestamp,
  cancel_reason integer,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.id, p.provider_txn_id, p.amount_tiyin, p.provider_created_at,
         p.paid_at, p.cancelled_at, p.cancel_reason, p.status::text
  FROM payments p
  WHERE p.provider = 'payme'
    AND p.provider_txn_id IS NOT NULL
    AND p.provider_created_at >= p_from
    AND p.provider_created_at <= p_to
  ORDER BY p.provider_created_at;
$$;

REVOKE ALL ON FUNCTION public.payme_statement(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payme_statement(timestamptz, timestamptz) TO docflow_app;
