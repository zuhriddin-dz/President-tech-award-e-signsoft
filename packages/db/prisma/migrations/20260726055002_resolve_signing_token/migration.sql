-- Public token resolution: a /sign/<token> visitor has NO session, so the API
-- cannot know the tenant until it resolves the token. This SECURITY DEFINER
-- function maps a token HASH -> {tenant_id, request_id}, bypassing RLS for that
-- one lookup only. The caller (apps/api/src/tenant/) then sets RLS context to
-- that tenant and RE-CHECKS the row under RLS (hash + status + expiry) — so a
-- resolved tenant is worth nothing without the tenant-side authorization.
-- Minimal on purpose: no status/expiry filter here; the tenant-side re-check owns that.
CREATE OR REPLACE FUNCTION public.resolve_signing_token(token_hash text)
RETURNS TABLE(tenant_id uuid, request_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT tenant_id, id FROM signature_requests WHERE signing_token_hash = token_hash;
$$;

REVOKE ALL ON FUNCTION public.resolve_signing_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_signing_token(text) TO docflow_app;
