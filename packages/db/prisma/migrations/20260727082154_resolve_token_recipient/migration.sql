-- Token resolution now also finds RECIPIENT tokens: an envelope has many
-- people, each holding their own link. Recipients are checked first (the new
-- world); the legacy single-token column stays as a fallback so links already
-- in inboxes keep working through the transition. Still SECURITY DEFINER,
-- still minimal — the tenant-side re-check owns status/expiry/hash, so a
-- resolution on its own authorizes nothing.
-- Adding an OUT column changes the return type, which CREATE OR REPLACE cannot do.
DROP FUNCTION IF EXISTS public.resolve_signing_token(text);

CREATE FUNCTION public.resolve_signing_token(token_hash text)
RETURNS TABLE(tenant_id uuid, request_id uuid, recipient_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT rc.tenant_id, rc.request_id, rc.id
  FROM recipients rc
  WHERE rc.signing_token_hash = token_hash
  UNION ALL
  SELECT sr.tenant_id, sr.id, NULL::uuid
  FROM signature_requests sr
  WHERE sr.signing_token_hash = token_hash
    AND NOT EXISTS (SELECT 1 FROM recipients x WHERE x.signing_token_hash = token_hash)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_signing_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_signing_token(text) TO docflow_app;
