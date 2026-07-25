-- CreateEnum
CREATE TYPE "tenant_kind" AS ENUM ('personal', 'company');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "kind" "tenant_kind" NOT NULL DEFAULT 'company',
ADD COLUMN     "personal_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_personal_user_id_key" ON "tenants"("personal_user_id");


-- ─────────────────────────────────────────────────────────────────────────────
-- ensure_personal_tenant — the sanctioned bootstrap for a PERSONAL workspace,
-- keyed by the verified Clerk user id (mirrors ensure_tenant for companies).
-- SECURITY DEFINER so it can map user -> tenant uuid before RLS context exists;
-- ON CONFLICT makes concurrent first requests race-safe.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_personal_tenant(clerk_user text, ws_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid;
BEGIN
  IF clerk_user IS NULL OR clerk_user = '' THEN
    RAISE EXCEPTION 'ensure_personal_tenant: empty clerk_user';
  END IF;

  INSERT INTO tenants (id, name, personal_user_id, kind)
  VALUES (gen_random_uuid(), COALESCE(NULLIF(ws_name, ''), 'My workspace'), clerk_user, 'personal')
  ON CONFLICT (personal_user_id) DO UPDATE
    SET name = COALESCE(NULLIF(EXCLUDED.name, 'My workspace'), tenants.name)
  RETURNING id INTO tid;

  RETURN tid;
END
$$;

REVOKE ALL ON FUNCTION public.ensure_personal_tenant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_personal_tenant(text, text) TO docflow_app;

-- ensure_tenant (company) now stamps kind='company' explicitly.
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

  INSERT INTO tenants (id, name, clerk_org_id, kind)
  VALUES (gen_random_uuid(), COALESCE(NULLIF(org_name, ''), 'Workspace'), clerk_org, 'company')
  ON CONFLICT (clerk_org_id) DO UPDATE
    SET name = COALESCE(NULLIF(EXCLUDED.name, 'Workspace'), tenants.name)
  RETURNING id INTO tid;

  RETURN tid;
END
$$;

REVOKE ALL ON FUNCTION public.ensure_tenant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_tenant(text, text) TO docflow_app;
