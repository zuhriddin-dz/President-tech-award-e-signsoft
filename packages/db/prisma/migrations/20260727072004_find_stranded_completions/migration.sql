-- Cross-tenant sweep for signatures that completed but were never sealed or
-- delivered (an enqueue failure, or a job lost between attempts). SECURITY
-- DEFINER because RLS deliberately hides other tenants' rows from the runtime
-- role — this is the one narrow, read-only exception, returning ids only so the
-- pipeline still runs under each row's own tenant context.
CREATE OR REPLACE FUNCTION public.find_stranded_completions(max_rows int)
RETURNS TABLE (request_id uuid, tenant_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, tenant_id
  FROM signature_requests
  WHERE status = 'completed'
    AND (signed_pdf_key IS NULL OR completion_emailed_at IS NULL)
    -- A grace period so the normal async path is never raced by the sweeper.
    AND completed_at < now() - interval '2 minutes'
  ORDER BY completed_at ASC
  LIMIT LEAST(GREATEST(max_rows, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.find_stranded_completions(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_stranded_completions(int) TO docflow_app;
