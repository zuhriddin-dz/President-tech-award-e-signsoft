-- Cross-tenant sweeps for the worker's lifecycle jobs. SECURITY DEFINER for
-- the same narrow reason as find_stranded_completions: RLS deliberately hides
-- other tenants' rows from the runtime role, and a background sweep must see
-- work across all of them. Both are READ-ONLY and return ids only, so the
-- actual writes still happen under each row's own tenant context.

-- Envelopes past their expiry that never finished.
CREATE OR REPLACE FUNCTION public.find_expired_envelopes(max_rows int)
RETURNS TABLE (request_id uuid, tenant_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, tenant_id
  FROM signature_requests
  WHERE status IN ('sent', 'viewed')
    AND expires_at <= now()
  ORDER BY expires_at ASC
  LIMIT LEAST(GREATEST(max_rows, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.find_expired_envelopes(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_expired_envelopes(int) TO docflow_app;

-- Recipients who have been sitting on a live link and need a nudge: invited
-- at least `after_days` ago (or last reminded that long ago), still unsigned,
-- envelope still live, and under the reminder cap.
CREATE OR REPLACE FUNCTION public.find_recipients_to_remind(
  after_days int, max_reminders int, max_rows int
)
RETURNS TABLE (recipient_id uuid, request_id uuid, tenant_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT rc.id, rc.request_id, rc.tenant_id
  FROM recipients rc
  JOIN signature_requests sr ON sr.id = rc.request_id
  WHERE rc.role = 'signer'
    AND rc.status IN ('sent', 'viewed')
    AND rc.signing_token_hash IS NOT NULL
    AND rc.reminder_count < max_reminders
    AND sr.status IN ('sent', 'viewed')
    AND sr.expires_at > now()
    AND COALESCE(rc.last_reminded_at, rc.sent_at) <= now() - (after_days || ' days')::interval
  ORDER BY COALESCE(rc.last_reminded_at, rc.sent_at) ASC
  LIMIT LEAST(GREATEST(max_rows, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.find_recipients_to_remind(int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_recipients_to_remind(int, int, int) TO docflow_app;
