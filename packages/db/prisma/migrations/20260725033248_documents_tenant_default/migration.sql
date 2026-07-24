-- tenant_id defaults to the RLS context: inserts never name a tenant at all.
-- The WITH CHECK policy still verifies the result, so a missing context makes
-- the insert fail (NULL tenant_id -> NOT NULL violation), never leak.
ALTER TABLE "documents"
  ALTER COLUMN "tenant_id"
  SET DEFAULT (NULLIF(current_setting('app.tenant_id', true), ''))::uuid;
