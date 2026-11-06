-- Owner-reviewed draft. Apply after the deletion-request draft on an isolated
-- restore. Activate the matching access checks before starting any request.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.members IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE soe_account_deletion_private.processing (
  request_id uuid PRIMARY KEY REFERENCES soe_account_deletion_private.requests(request_id) ON DELETE RESTRICT,
  member_id uuid UNIQUE,
  auth_user_id uuid UNIQUE,
  wallet_hash bytea UNIQUE CHECK (octet_length(wallet_hash) = 32),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (member_id IS NOT NULL OR auth_user_id IS NOT NULL)
);
ALTER TABLE soe_account_deletion_private.processing ENABLE ROW LEVEL SECURITY;
CREATE TABLE soe_account_deletion_private.identity_gate (
  only_row boolean PRIMARY KEY CHECK (only_row),
  revision bigint NOT NULL
);
ALTER TABLE soe_account_deletion_private.identity_gate ENABLE ROW LEVEL SECURITY;
INSERT INTO soe_account_deletion_private.identity_gate VALUES (true, 0);
REVOKE ALL ON TABLE soe_account_deletion_private.processing, soe_account_deletion_private.identity_gate
FROM PUBLIC, anon, authenticated, service_role;

-- Only identity-changing writes take this lock. Ordinary member reads and
-- profile edits continue. The same lock is held while resolving a request.
CREATE FUNCTION soe_account_deletion_private.serialize_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE = 'PT503';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM soe_account_deletion_private.processing AS processing
    WHERE processing.member_id IN (NEW.id, OLD.id)
       OR processing.auth_user_id IN (NEW.supabase_auth_id, OLD.supabase_auth_id)
       OR processing.wallet_hash = sha256(convert_to(lower(NEW.wallet_address), 'UTF8'))
  ) THEN
    RAISE EXCEPTION 'Account removal is in progress' USING ERRCODE = 'PT403';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soe_account_deletion_private.serialize_identity_change() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER soe_serialize_member_erasure
BEFORE INSERT OR UPDATE OF id, supabase_auth_id, wallet_address OR DELETE ON public.members
FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.serialize_identity_change();

CREATE FUNCTION soe_account_deletion_private.start_erasure(
  p_request_id uuid, p_expected_member_id uuid, p_expected_auth_user_id uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
SET lock_timeout = '3s'
AS $$
DECLARE
  request soe_account_deletion_private.requests%ROWTYPE;
  existing soe_account_deletion_private.processing%ROWTYPE;
  resolved_member uuid;
  resolved_auth uuid;
  resolved_wallet text;
  started timestamptz;
BEGIN
  -- Resolve after taking the exclusive gate lock so an identity that
  -- committed while we waited is included in the owner review.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Start erasure in a read-committed transaction' USING ERRCODE = 'PT409';
  END IF;
  PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE = 'PT503';
  END IF;
  SELECT * INTO request FROM soe_account_deletion_private.requests AS q
    WHERE q.request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No reviewed deletion request matched' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO existing FROM soe_account_deletion_private.processing AS p WHERE p.request_id = p_request_id;
  IF FOUND THEN
    IF existing.member_id IS DISTINCT FROM p_expected_member_id OR
       existing.auth_user_id IS DISTINCT FROM p_expected_auth_user_id THEN
      RAISE EXCEPTION 'Reviewed deletion owner changed' USING ERRCODE = 'PT409';
    END IF;
    RETURN existing.started_at;
  END IF;

  IF request.member_id IS NOT NULL THEN
    SELECT m.id, m.supabase_auth_id, m.wallet_address INTO STRICT resolved_member, resolved_auth, resolved_wallet
    FROM public.members AS m WHERE m.id = request.member_id;
    IF request.auth_user_id IS NOT NULL AND request.auth_user_id IS DISTINCT FROM resolved_auth THEN
      RAISE EXCEPTION 'Reviewed deletion owner changed' USING ERRCODE = 'PT409';
    END IF;
  ELSE
    SELECT m.id, request.auth_user_id, m.wallet_address INTO STRICT resolved_member, resolved_auth, resolved_wallet
    FROM (SELECT 1) AS account
    LEFT JOIN public.members AS m ON m.supabase_auth_id = request.auth_user_id;
  END IF;

  IF resolved_member IS DISTINCT FROM p_expected_member_id OR resolved_auth IS DISTINCT FROM p_expected_auth_user_id THEN
    RAISE EXCEPTION 'Reviewed deletion owner changed' USING ERRCODE = 'PT409';
  END IF;
  IF resolved_wallet IS NOT NULL AND (lower(resolved_wallet) !~ '^0x[0-9a-f]{40}$' OR EXISTS (
    SELECT 1 FROM public.members AS m
    WHERE m.id <> resolved_member AND lower(m.wallet_address) = lower(resolved_wallet)
  )) THEN
    RAISE EXCEPTION 'Wallet identity requires review' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO soe_account_deletion_private.processing (request_id, member_id, auth_user_id, wallet_hash)
  VALUES (p_request_id, resolved_member, resolved_auth, sha256(convert_to(lower(resolved_wallet), 'UTF8')))
  RETURNING started_at INTO started;
  -- A repeatable-read identity writer with a snapshot from before this
  -- transition must retry instead of missing the new processing row.
  UPDATE soe_account_deletion_private.identity_gate SET revision = revision + 1 WHERE only_row;
  RETURN started;
EXCEPTION
  WHEN no_data_found OR too_many_rows OR unique_violation THEN
    RAISE EXCEPTION 'Deletion owner needs a new review' USING ERRCODE = 'PT409';
END;
$$;
REVOKE ALL ON FUNCTION soe_account_deletion_private.start_erasure(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Only verified server-side callers may use the narrow access result.
CREATE FUNCTION soe_account_deletion_private.erasure_access_allowed(p_provider text, p_subject uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_subject IS NULL OR p_provider IS NULL OR p_provider NOT IN ('supabase', 'wallet') THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM soe_account_deletion_private.processing AS p
      WHERE (p_provider = 'supabase' AND p.auth_user_id = p_subject)
         OR (p_provider = 'wallet' AND p.member_id = p_subject)
    )
  END;
$$;
CREATE FUNCTION public.soe_account_erasure_access_allowed(p_provider text, p_subject uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT soe_account_deletion_private.erasure_access_allowed(p_provider, p_subject);
$$;

REVOKE ALL ON FUNCTION
  soe_account_deletion_private.erasure_access_allowed(text, uuid),
  public.soe_account_erasure_access_allowed(text, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  soe_account_deletion_private.erasure_access_allowed(text, uuid),
  public.soe_account_erasure_access_allowed(text, uuid)
TO service_role;

DO $$
BEGIN
  IF pg_has_role('service_role', current_user, 'MEMBER')
     OR has_function_privilege('service_role', 'soe_account_deletion_private.start_erasure(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'soe_account_deletion_private.serialize_identity_change()', 'EXECUTE')
     OR EXISTS (
       SELECT 1 FROM (VALUES ('processing'), ('identity_gate')) AS private(table_name)
       WHERE has_table_privilege('service_role', 'soe_account_deletion_private.' || private.table_name,
                                 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     )
     OR EXISTS (
       SELECT 1 FROM (VALUES ('anon'), ('authenticated')) AS browser(role_name)
       WHERE pg_has_role(role_name, 'service_role', 'MEMBER')
          OR pg_has_role(role_name, current_user, 'MEMBER')
          OR has_schema_privilege(role_name, 'soe_account_deletion_private', 'USAGE,CREATE')
          OR has_function_privilege(role_name, 'public.soe_account_erasure_access_allowed(text,uuid)', 'EXECUTE')
          OR has_function_privilege(role_name, 'soe_account_deletion_private.erasure_access_allowed(text,uuid)', 'EXECUTE')
          OR has_function_privilege(role_name, 'soe_account_deletion_private.start_erasure(uuid,uuid,uuid)', 'EXECUTE')
          OR has_function_privilege(role_name, 'soe_account_deletion_private.serialize_identity_change()', 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'Unexpected effective account erasure privileges';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
