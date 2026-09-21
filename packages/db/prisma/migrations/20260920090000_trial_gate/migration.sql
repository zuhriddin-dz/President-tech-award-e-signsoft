-- The 7-day free trial, stamped by the DATABASE.
--
-- Workspaces are inserted by the SECURITY DEFINER bootstrap functions
-- (ensure_tenant, ensure_personal_tenant), so a default written in application
-- code would never run for the rows that matter. Same reasoning as tenant_id.
--
-- No new table, so no new policy: `tenants` already carries tenant_isolation
-- from the initial migration, and these are columns on it.

-- CreateEnum
CREATE TYPE "tenant_plan" AS ENUM ('trial', 'pro');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "plan" "tenant_plan" NOT NULL DEFAULT 'trial',
ADD COLUMN     "trial_ends_at" TIMESTAMP(3) NOT NULL DEFAULT (now() + interval '7 days');

-- Workspaces that already exist get a FRESH 7 days from the moment this runs,
-- not 7 days from the day they signed up: nobody who was using the product
-- before the trial existed should be locked out by the deploy that adds it.
-- (The ADD COLUMN default above already lands on existing rows; this states the
-- intent so a later change to that default cannot silently change it.)
UPDATE "tenants" SET "trial_ends_at" = now() + interval '7 days';
