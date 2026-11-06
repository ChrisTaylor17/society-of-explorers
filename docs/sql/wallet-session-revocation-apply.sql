-- Owner-reviewed draft. Rehearse on an isolated restore after wallet-challenge-consumption-apply.sql.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_namespace
    WHERE nspname = 'soe_wallet_private' AND nspowner = current_user::regrole
  ) OR to_regprocedure('public.soe_wallet_challenge_consume(text,bigint)') IS NULL THEN
    RAISE EXCEPTION 'Apply the wallet challenge migration as the same owner first';
  END IF;
END;
$$;

CREATE TABLE soe_wallet_private.revoked_sessions (
  digest bytea PRIMARY KEY CHECK (octet_length(digest) = 32),
  expires_at bigint NOT NULL
);
CREATE INDEX revoked_sessions_expiry_idx ON soe_wallet_private.revoked_sessions (expires_at, digest);
ALTER TABLE soe_wallet_private.revoked_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soe_wallet_private.revoked_sessions FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION soe_wallet_private.session_access(p_digest text, p_expires_at bigint, p_revoke boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, soe_wallet_private
SET lock_timeout = '2s'
AS $$
DECLARE
  now_seconds bigint := floor(extract(epoch FROM clock_timestamp()))::bigint;
BEGIN
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR p_revoke IS NULL
     OR p_expires_at IS NULL OR p_expires_at <= now_seconds OR p_expires_at > now_seconds + 7776000 THEN
    RETURN false;
  END IF;

  IF NOT p_revoke THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM soe_wallet_private.revoked_sessions WHERE digest = decode(p_digest, 'hex')
    );
  END IF;

  -- Allow for clock skew and remove only a small batch on each revocation.
  WITH stale AS MATERIALIZED (
    SELECT digest
    FROM soe_wallet_private.revoked_sessions
    WHERE expires_at <= now_seconds - 3600
    ORDER BY expires_at, digest
    LIMIT 32
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM soe_wallet_private.revoked_sessions AS revoked
  USING stale
  WHERE revoked.digest = stale.digest;

  INSERT INTO soe_wallet_private.revoked_sessions (digest, expires_at)
  VALUES (decode(p_digest, 'hex'), p_expires_at)
  ON CONFLICT (digest) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION soe_wallet_private.session_access(text, bigint, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION soe_wallet_private.session_access(text, bigint, boolean) TO service_role;

CREATE FUNCTION public.soe_wallet_session_access(p_digest text, p_expires_at bigint, p_revoke boolean)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT soe_wallet_private.session_access(p_digest, p_expires_at, p_revoke);
$$;

REVOKE ALL ON FUNCTION public.soe_wallet_session_access(text, bigint, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soe_wallet_session_access(text, bigint, boolean) TO service_role;

DO $$
BEGIN
  IF pg_has_role('service_role', current_user, 'MEMBER')
     OR NOT has_schema_privilege('service_role', 'soe_wallet_private', 'USAGE')
     OR has_schema_privilege('service_role', 'soe_wallet_private', 'CREATE')
     OR has_table_privilege('service_role', 'soe_wallet_private.revoked_sessions',
                            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR EXISTS (
       SELECT 1 FROM (VALUES ('anon'), ('authenticated')) AS browser(role_name)
       WHERE pg_has_role(role_name, 'service_role', 'MEMBER')
          OR pg_has_role(role_name, current_user, 'MEMBER')
          OR has_schema_privilege(role_name, 'soe_wallet_private', 'USAGE,CREATE')
          OR has_table_privilege(role_name, 'soe_wallet_private.revoked_sessions',
                                 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_function_privilege(role_name, 'public.soe_wallet_session_access(text,bigint,boolean)', 'EXECUTE')
          OR has_function_privilege(role_name, 'soe_wallet_private.session_access(text,bigint,boolean)', 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'Unexpected effective wallet session privileges';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
