-- Owner-reviewed draft. Apply to an isolated restore before the approved wallet sign-in cutover.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE SCHEMA soe_wallet_private;
REVOKE ALL ON SCHEMA soe_wallet_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA soe_wallet_private TO service_role;

CREATE TABLE soe_wallet_private.used_challenges (
  digest bytea PRIMARY KEY CHECK (octet_length(digest) = 32),
  expires_at bigint NOT NULL
);
CREATE INDEX used_challenges_expiry_idx ON soe_wallet_private.used_challenges (expires_at, digest);
ALTER TABLE soe_wallet_private.used_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soe_wallet_private.used_challenges FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION soe_wallet_private.consume_challenge(p_digest text, p_expires_at bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, soe_wallet_private
SET lock_timeout = '3s'
AS $$
DECLARE
  now_seconds bigint := floor(extract(epoch FROM clock_timestamp()))::bigint;
BEGIN
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$'
     OR p_expires_at IS NULL OR p_expires_at <= now_seconds OR p_expires_at > now_seconds + 660 THEN
    RETURN false;
  END IF;

  -- Keep expired rows for an hour and remove a bounded batch per valid call.
  WITH stale AS MATERIALIZED (
    SELECT digest
    FROM soe_wallet_private.used_challenges
    WHERE expires_at <= now_seconds - 3600
    ORDER BY expires_at, digest
    LIMIT 32
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM soe_wallet_private.used_challenges AS used
  USING stale
  WHERE used.digest = stale.digest;

  INSERT INTO soe_wallet_private.used_challenges (digest, expires_at)
  VALUES (decode(p_digest, 'hex'), p_expires_at)
  ON CONFLICT (digest) DO NOTHING;

  -- The unique index may have waited for another transaction.
  RETURN FOUND AND p_expires_at > extract(epoch FROM clock_timestamp());
END;
$$;

REVOKE ALL ON FUNCTION soe_wallet_private.consume_challenge(text, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION soe_wallet_private.consume_challenge(text, bigint) TO service_role;

CREATE FUNCTION public.soe_wallet_challenge_consume(p_digest text, p_expires_at bigint)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT soe_wallet_private.consume_challenge(p_digest, p_expires_at);
$$;

REVOKE ALL ON FUNCTION public.soe_wallet_challenge_consume(text, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soe_wallet_challenge_consume(text, bigint) TO service_role;

DO $$
BEGIN
  IF pg_has_role('service_role', current_user, 'MEMBER')
     OR has_schema_privilege('service_role', 'soe_wallet_private', 'CREATE')
     OR has_table_privilege('service_role', 'soe_wallet_private.used_challenges',
                            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR EXISTS (
       SELECT 1 FROM (VALUES ('anon'), ('authenticated')) AS browser(role_name)
       WHERE pg_has_role(role_name, 'service_role', 'MEMBER')
          OR pg_has_role(role_name, current_user, 'MEMBER')
          OR has_schema_privilege(role_name, 'soe_wallet_private', 'USAGE,CREATE')
          OR has_function_privilege(role_name, 'public.soe_wallet_challenge_consume(text,bigint)', 'EXECUTE')
          OR has_function_privilege(role_name, 'soe_wallet_private.consume_challenge(text,bigint)', 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'Unexpected effective wallet challenge privileges';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
