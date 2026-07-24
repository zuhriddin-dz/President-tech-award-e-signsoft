-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "clerk_org_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "clerk_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_clerk_org_id_key" ON "tenants"("clerk_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users"("clerk_user_id");


-- ─────────────────────────────────────────────────────────────────────────────
-- ensure_tenant — the ONE sanctioned bootstrap past RLS.
--
-- Mapping a verified Clerk org to our tenant uuid is chicken-and-egg under
-- RLS: you cannot read tenants until you know the tenant id. This SECURITY
-- DEFINER function (runs as its owner, neondb_owner) is the single, narrow
-- door: given a VERIFIED clerk org id + display name, it returns the tenant
-- uuid, creating or renaming the row as needed. The API calls it only from
-- apps/api/src/tenant/ with claims from a verified session token — never
-- with client-supplied values.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_tenant(clerk_org text, org_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid;
BEGIN
  IF clerk_org IS NULL OR clerk_org = '' THEN
    RAISE EXCEPTION 'ensure_tenant: empty clerk_org';
  END IF;

  SELECT id INTO tid FROM tenants WHERE clerk_org_id = clerk_org;
  IF tid IS NULL THEN
    INSERT INTO tenants (id, name, clerk_org_id)
    VALUES (gen_random_uuid(), COALESCE(NULLIF(org_name, ''), 'Workspace'), clerk_org)
    RETURNING id INTO tid;
  ELSIF NULLIF(org_name, '') IS NOT NULL THEN
    UPDATE tenants SET name = org_name WHERE id = tid AND name IS DISTINCT FROM org_name;
  END IF;
  RETURN tid;
END
$$;

REVOKE ALL ON FUNCTION public.ensure_tenant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_tenant(text, text) TO docflow_app;
