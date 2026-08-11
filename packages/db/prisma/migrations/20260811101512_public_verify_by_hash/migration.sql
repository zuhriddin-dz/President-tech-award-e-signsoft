-- Public verification: look a sealed document up by its OWN fingerprint.
--
-- The product's claim is that anyone holding a signed document can re-check it
-- later without trusting us. Until now that was only true in principle: the
-- verify route required a session AND membership of the owning workspace, and
-- it re-hashed the copy in OUR storage rather than the copy in the caller's
-- hand. The person most likely to need the check — a counterparty holding a
-- PDF that arrived by email — had no way to make it.
--
-- Lookup is by document_hash, which is what a stranger can compute from the
-- file itself. Nothing else about the document is reachable this way.

-- Sealed rows only. A partial index keeps it small: most rows are in flight and
-- have no hash, and the ones that do are exactly the ones this can find.
CREATE INDEX IF NOT EXISTS signature_requests_document_hash_idx
  ON signature_requests (document_hash)
  WHERE document_hash IS NOT NULL;

-- SECURITY DEFINER because RLS hides other tenants' rows from the runtime role,
-- and a document's counterparty is by definition outside the tenant that sent
-- it. This is the second sanctioned read-only exception, and the narrowest:
--
--   * it takes a SHA-256 hex digest, so it cannot be enumerated — you must
--     already hold the bytes to ask the question;
--   * it returns ONLY what verifying the seal requires. No tenant, no document
--     name, no signer, no storage key. Whoever calls it learns whether the file
--     they hold was sealed here and when, and nothing further;
--   * it matches sealed rows only, so an in-flight envelope is invisible.
CREATE OR REPLACE FUNCTION public.find_seal_by_hash(hash text)
RETURNS TABLE (request_id uuid, completed_at timestamptz, seal_signature text, seal_kid text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, completed_at, seal_signature, seal_kid
  FROM signature_requests
  WHERE document_hash = hash
    AND seal_signature IS NOT NULL
    AND seal_kid IS NOT NULL
    AND completed_at IS NOT NULL
  -- A hash identifies one sealed document; LIMIT 1 is belt and braces against
  -- a duplicate row ever making the result ambiguous.
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_seal_by_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_seal_by_hash(text) TO docflow_app;
