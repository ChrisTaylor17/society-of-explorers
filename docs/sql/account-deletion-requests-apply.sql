-- Owner-reviewed draft. Rehearse on an isolated database. Intake stays off until
-- the deletion procedure, retention schedule, and completion notice are verified.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE SCHEMA soe_account_deletion_private;
REVOKE ALL ON SCHEMA soe_account_deletion_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA soe_account_deletion_private TO service_role;

CREATE TABLE soe_account_deletion_private.requests (
  request_id uuid PRIMARY KEY,
  member_id uuid UNIQUE,
  auth_user_id uuid UNIQUE,
  receipt_hash bytea NOT NULL CHECK (octet_length(receipt_hash) = 32),
  requested_at timestamptz NOT NULL,
  review_by timestamptz NOT NULL CHECK (review_by > requested_at),
  CHECK (member_id IS NOT NULL OR auth_user_id IS NOT NULL)
);
ALTER TABLE soe_account_deletion_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soe_account_deletion_private.requests FROM PUBLIC, anon, authenticated, service_role;

-- The website verifies the selected provider. A valid Supabase sign-in can
-- precede a member record. An existing wallet sign-in already names a member.
CREATE FUNCTION soe_account_deletion_private.owner_links(p_provider text, p_subject uuid)
RETURNS TABLE (member_id uuid, auth_user_id uuid)
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT m.id, p_subject
  FROM (SELECT 1) AS account
  LEFT JOIN public.members AS m ON m.supabase_auth_id = p_subject
  WHERE p_provider = 'supabase' AND p_subject IS NOT NULL
  UNION ALL
  SELECT m.id, m.supabase_auth_id
  FROM public.members AS m
  WHERE p_provider = 'wallet' AND m.id = p_subject AND m.wallet_address IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION soe_account_deletion_private.owner_links(text, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION soe_account_deletion_private.owner_state(p_provider text, p_subject uuid)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT q.request_id, q.requested_at, q.review_by
  FROM soe_account_deletion_private.owner_links(p_provider, p_subject) AS account
  JOIN soe_account_deletion_private.requests AS q
    ON q.auth_user_id = account.auth_user_id OR
       (q.member_id = account.member_id AND
        (q.auth_user_id IS NULL OR account.auth_user_id IS NULL OR q.auth_user_id = account.auth_user_id));
$$;

CREATE FUNCTION soe_account_deletion_private.submit_request(
  p_provider text, p_subject uuid, p_request_id uuid, p_receipt_hash text, p_review_days integer
)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '3s'
AS $$
DECLARE
  account record;
  received_at timestamptz := clock_timestamp();
BEGIN
  IF p_request_id IS NULL OR p_receipt_hash IS NULL OR p_receipt_hash !~ '^[0-9a-f]{64}$'
     OR p_review_days IS NULL OR p_review_days NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Invalid account deletion request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT account
  FROM soe_account_deletion_private.owner_links(p_provider, p_subject);

  IF account.member_id IS NOT NULL THEN
    -- The linked owner must still match while this request is recorded.
    PERFORM 1 FROM public.members AS m
    WHERE m.id = account.member_id AND m.supabase_auth_id IS NOT DISTINCT FROM account.auth_user_id
      AND (p_provider <> 'wallet' OR m.wallet_address IS NOT NULL)
    FOR NO KEY UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account owner changed' USING ERRCODE = 'PT409';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM soe_account_deletion_private.owner_state(p_provider, p_subject)) THEN
    INSERT INTO soe_account_deletion_private.requests
      (request_id, member_id, auth_user_id, receipt_hash, requested_at, review_by)
    VALUES (p_request_id, account.member_id, account.auth_user_id, decode(p_receipt_hash, 'hex'),
            received_at, received_at + make_interval(hours => p_review_days * 24))
    ON CONFLICT DO NOTHING;
  END IF;

  -- A lost response may be retried with the original code. A collision or a
  -- new code cannot rotate another request's secret or disclose its receipt.
  RETURN QUERY
    SELECT owner.id, owner."requestedAt", owner."reviewBy"
    FROM soe_account_deletion_private.owner_state(p_provider, p_subject) AS owner
    JOIN soe_account_deletion_private.requests AS q ON q.request_id = owner.id
    WHERE q.request_id = p_request_id AND q.receipt_hash = decode(p_receipt_hash, 'hex');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An account deletion request is already pending or its code is unavailable' USING ERRCODE = 'PT409';
  END IF;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.receipt_status(p_request_id uuid, p_receipt_hash text)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT q.request_id, q.requested_at, q.review_by
  FROM soe_account_deletion_private.requests AS q
  WHERE q.request_id = p_request_id
    AND q.receipt_hash = CASE WHEN p_receipt_hash ~ '^[0-9a-f]{64}$' THEN decode(p_receipt_hash, 'hex') END;
$$;

CREATE FUNCTION public.soe_account_deletion_owner_state(p_provider text, p_subject uuid)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT * FROM soe_account_deletion_private.owner_state(p_provider, p_subject);
$$;

CREATE FUNCTION public.soe_account_deletion_request(
  p_provider text, p_subject uuid, p_request_id uuid, p_receipt_hash text, p_review_days integer
)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT * FROM soe_account_deletion_private.submit_request(p_provider, p_subject, p_request_id, p_receipt_hash, p_review_days);
$$;

CREATE FUNCTION public.soe_account_deletion_status(p_request_id uuid, p_receipt_hash text)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT * FROM soe_account_deletion_private.receipt_status(p_request_id, p_receipt_hash);
$$;

REVOKE ALL ON FUNCTION
  public.soe_account_deletion_owner_state(text, uuid),
  public.soe_account_deletion_request(text, uuid, uuid, text, integer),
  public.soe_account_deletion_status(uuid, text),
  soe_account_deletion_private.owner_state(text, uuid),
  soe_account_deletion_private.submit_request(text, uuid, uuid, text, integer),
  soe_account_deletion_private.receipt_status(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.soe_account_deletion_owner_state(text, uuid),
  public.soe_account_deletion_request(text, uuid, uuid, text, integer),
  public.soe_account_deletion_status(uuid, text),
  soe_account_deletion_private.owner_state(text, uuid),
  soe_account_deletion_private.submit_request(text, uuid, uuid, text, integer),
  soe_account_deletion_private.receipt_status(uuid, text)
TO service_role;

DO $$
BEGIN
  IF pg_has_role('service_role', current_user, 'MEMBER')
     OR has_schema_privilege('service_role', 'soe_account_deletion_private', 'CREATE')
     OR has_table_privilege('service_role', 'soe_account_deletion_private.requests',
                            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR EXISTS (
       SELECT 1
       FROM (VALUES ('anon'), ('authenticated')) AS browser(role_name)
       WHERE pg_has_role(role_name, 'service_role', 'MEMBER')
          OR pg_has_role(role_name, current_user, 'MEMBER')
          OR has_schema_privilege(role_name, 'soe_account_deletion_private', 'USAGE,CREATE')
          OR has_table_privilege(role_name, 'soe_account_deletion_private.requests',
                                 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR EXISTS (
            SELECT 1 FROM pg_proc AS f JOIN pg_namespace AS n ON n.oid = f.pronamespace
            WHERE (n.nspname = 'soe_account_deletion_private' OR
                   (n.nspname = 'public' AND f.proname IN (
                     'soe_account_deletion_owner_state', 'soe_account_deletion_request', 'soe_account_deletion_status'
                   )))
              AND has_function_privilege(role_name, f.oid, 'EXECUTE')
          )
     ) THEN
    RAISE EXCEPTION 'Unexpected effective account deletion privileges';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
