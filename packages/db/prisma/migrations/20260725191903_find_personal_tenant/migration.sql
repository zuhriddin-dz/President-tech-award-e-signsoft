-- Read-only personal-tenant lookup by verified Clerk user id. SECURITY DEFINER
-- so it can resolve the tenant BEFORE RLS context exists (the same
-- chicken-and-egg the ensure_* functions solve). Returns NULL when the user
-- has no personal workspace yet — that NULL is what drives the onboarding
-- choice. Read-only on purpose: only the explicit onboarding step creates.
CREATE OR REPLACE FUNCTION public.find_personal_tenant(clerk_user text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM tenants WHERE personal_user_id = clerk_user AND kind = 'personal';
$$;

REVOKE ALL ON FUNCTION public.find_personal_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_personal_tenant(text) TO docflow_app;
