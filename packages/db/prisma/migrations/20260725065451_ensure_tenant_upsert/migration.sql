-- Make ensure_tenant() race-safe. The old SELECT-then-INSERT let two concurrent
-- first requests from a brand-new org (a fresh signup fires /me and /documents
-- in parallel) both read NULL, both INSERT, and the loser 500 on the unique
-- index. INSERT ... ON CONFLICT resolves it atomically in one statement.
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

  INSERT INTO tenants (id, name, clerk_org_id)
  VALUES (gen_random_uuid(), COALESCE(NULLIF(org_name, ''), 'Workspace'), clerk_org)
  ON CONFLICT (clerk_org_id) DO UPDATE
    -- Only touch name when a non-empty new one was supplied; keep it otherwise.
    SET name = COALESCE(NULLIF(EXCLUDED.name, 'Workspace'), tenants.name)
  RETURNING id INTO tid;

  RETURN tid;
END
$$;

REVOKE ALL ON FUNCTION public.ensure_tenant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_tenant(text, text) TO docflow_app;
