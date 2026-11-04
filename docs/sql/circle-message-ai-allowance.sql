-- UNAPPLIED LOCAL CANDIDATE. No provider/account spending approval is implied.
-- Persistent request allowance, NOT a dollar/token-price or provider billing cap.
-- Owner configures an explicit finite window and lifetime cumulative ceilings.
-- Every committed debit remains counted, including lost replies, aborts, errors
-- and unsent attempts. No refund, automatic expiry/reset, or replay permission.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;

DO $preflight$
BEGIN
 IF current_user IN('anon','authenticated','service_role')
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls
   AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND
   (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
   WHERE r.rolname IN('anon','authenticated','service_role'))
  OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message AI allowance owner or role authority requires review.';
 END IF;
 IF to_regclass('public.circle_message_ai_allowance') IS NOT NULL
  OR to_regclass('public.circle_message_ai_attempts') IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
   AND proname='soe_circle_message_ai_reserve') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message AI allowance objects already exist; review before applying.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.soe_circle_message_ai_snapshot(uuid,uuid,uuid)')
  AND NOT prosecdef AND pg_get_userbyid(proowner)=current_user)
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.circle_message_ai_consents')
   AND relkind='r' AND relrowsecurity AND pg_get_userbyid(relowner)=current_user) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message AI allowance consent prerequisites require review.';
 END IF;
END
$preflight$;

CREATE TABLE public.circle_message_ai_allowance (
 singleton smallint PRIMARY KEY CHECK(singleton=1),
 enabled boolean NOT NULL DEFAULT false,
 starts_at timestamptz,
 ends_at timestamptz,
 global_limit integer NOT NULL DEFAULT 0 CHECK(global_limit>=0),
 per_reviewer_limit integer NOT NULL DEFAULT 0 CHECK(per_reviewer_limit>=0 AND per_reviewer_limit<=global_limit),
 -- A narrow UPDATE grant permits FOR UPDATE, without granting budget edits.
 lock_marker boolean NOT NULL DEFAULT false CHECK(NOT lock_marker),
 CHECK((starts_at IS NULL AND ends_at IS NULL) OR
  (starts_at IS NOT NULL AND ends_at IS NOT NULL AND isfinite(starts_at) AND isfinite(ends_at) AND starts_at<ends_at)),
 CHECK(NOT enabled OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND global_limit>0 AND per_reviewer_limit>0))
);
INSERT INTO public.circle_message_ai_allowance(singleton) VALUES(1);
COMMENT ON TABLE public.circle_message_ai_allowance IS
 'soe-message-ai-allowance:v1; disabled/zero by default; finite owner-reviewed window; limits count all lifetime attempts, never a new-window reset';
ALTER TABLE public.circle_message_ai_allowance ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.circle_message_ai_attempts (
 attempt_id uuid PRIMARY KEY,
 actor_id uuid NOT NULL,
 circle_id uuid NOT NULL,
 message_id uuid NOT NULL,
 message_revision bigint NOT NULL CHECK(message_revision BETWEEN 0 AND 9007199254740991),
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 consent_revision bigint NOT NULL CHECK(consent_revision BETWEEN 1 AND 9007199254740991),
 policy text NOT NULL CHECK(policy='anthropic-message-review-v1'),
 debited_at timestamptz NOT NULL,
 valid_until timestamptz NOT NULL CHECK(valid_until>debited_at AND valid_until<=debited_at+interval '8 seconds')
);
CREATE INDEX circle_message_ai_attempts_actor_idx ON public.circle_message_ai_attempts(actor_id);
COMMENT ON TABLE public.circle_message_ai_attempts IS
 'soe-message-ai-attempts:v1; private immutable request debits; no content/advice/provider key; every row counted forever; expiry ends send authority only, never refunds';
ALTER TABLE public.circle_message_ai_attempts ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.soe_circle_message_ai_reserve(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_attempt_id uuid,
 p_expected_revision bigint,p_content_hash text,p_expected_consent_revision bigint,p_policy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $reserve$
DECLARE snapshot jsonb; allowance public.circle_message_ai_allowance; total bigint; reviewer_total bigint;
 now_at timestamptz; until_at timestamptz; reviewer_expires_at timestamptz; valid_ms integer;
BEGIN
 IF p_actor IS NULL OR p_circle_id IS NULL OR p_message_id IS NULL OR p_attempt_id IS NULL
  OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991
  OR p_expected_consent_revision IS NULL OR p_expected_consent_revision NOT BETWEEN 1 AND 9007199254740991
  OR p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Use a valid AI allowance request.';
 END IF;
 IF p_policy IS DISTINCT FROM 'anthropic-message-review-v1' THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='AI review policy changed.';
 END IF;
 -- Separate statements after the mutex need fresh committed snapshots. Reject
 -- caller isolation modes that could retain a stale count after a lock wait.
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='AI allowance is unavailable.';
 END IF;
 -- Existing cohort -> message -> safety -> consent locks and live assignment,
 -- conflicts, withdrawal and complete-case checks are unchanged and reused.
 snapshot:=public.soe_circle_message_ai_snapshot(p_actor,p_circle_id,p_message_id);
 IF (snapshot->>'revision')::bigint IS DISTINCT FROM p_expected_revision
  OR snapshot->>'contentHash' IS DISTINCT FROM p_content_hash
  OR (snapshot->>'consentRevision')::bigint IS DISTINCT FROM p_expected_consent_revision
  OR snapshot->>'policy' IS DISTINCT FROM p_policy THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='AI review or consent changed.';
 END IF;
 -- All reservations lock this exact singleton before reading either count.
 -- Locks end at RPC commit; a transaction is never held over provider I/O.
 SELECT * INTO allowance FROM public.circle_message_ai_allowance WHERE singleton=1 FOR UPDATE;
 now_at:=clock_timestamp();
 IF NOT FOUND OR NOT allowance.enabled OR allowance.starts_at IS NULL OR allowance.ends_at IS NULL
  OR NOT isfinite(allowance.starts_at) OR NOT isfinite(allowance.ends_at)
  OR now_at<allowance.starts_at OR now_at>=allowance.ends_at
  OR allowance.global_limit<=0 OR allowance.per_reviewer_limit<=0 THEN
  RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='AI allowance is unavailable.';
 END IF;
 -- Duplicate IDs are never an idempotent send receipt, even with identical
 -- bindings. A lost reservation response must not authorize a resend.
 IF EXISTS(SELECT 1 FROM public.circle_message_ai_attempts WHERE attempt_id=p_attempt_id) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='AI attempt already reserved; no retry is authorized.';
 END IF;
 SELECT count(*) INTO total FROM public.circle_message_ai_attempts;
 SELECT count(*) INTO reviewer_total FROM public.circle_message_ai_attempts WHERE actor_id=p_actor;
 IF total>=allowance.global_limit OR reviewer_total>=allowance.per_reviewer_limit THEN
  RAISE EXCEPTION USING ERRCODE='PT429',MESSAGE='AI request allowance is exhausted. Human review remains available.';
 END IF;
 -- Row locks prevent mutation, but clock time can expire an assignment during
 -- mutex waits/counts. Recheck current authorization immediately before debit.
 -- Previously acquired locks are reentrant; no inverse lock order is introduced.
 snapshot:=public.soe_circle_message_ai_snapshot(p_actor,p_circle_id,p_message_id);
 IF (snapshot->>'revision')::bigint IS DISTINCT FROM p_expected_revision
  OR snapshot->>'contentHash' IS DISTINCT FROM p_content_hash
  OR (snapshot->>'consentRevision')::bigint IS DISTINCT FROM p_expected_consent_revision
  OR snapshot->>'policy' IS DISTINCT FROM p_policy THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='AI review or consent changed.';
 END IF;
 SELECT expires_at INTO reviewer_expires_at FROM public.circle_reviewer_grants
  WHERE cohort_id=p_circle_id AND member_id=p_actor;
 now_at:=clock_timestamp();
 until_at:=least(allowance.ends_at,now_at+interval '8 seconds',reviewer_expires_at);
 valid_ms:=floor(extract(epoch FROM until_at-now_at)*1000)::integer;
 IF valid_ms<1 THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='AI allowance is unavailable.'; END IF;
 INSERT INTO public.circle_message_ai_attempts(attempt_id,actor_id,circle_id,message_id,message_revision,content_hash,
  consent_revision,policy,debited_at,valid_until)
 VALUES(p_attempt_id,p_actor,p_circle_id,p_message_id,p_expected_revision,p_content_hash,
  p_expected_consent_revision,p_policy,now_at,until_at);
 valid_ms:=floor(extract(epoch FROM until_at-clock_timestamp())*1000)::integer;
 IF valid_ms<1 THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='AI allowance is unavailable.'; END IF;
 RETURN jsonb_build_object('attemptId',p_attempt_id,'circleId',p_circle_id,'messageId',p_message_id,
  'revision',p_expected_revision,'contentHash',p_content_hash,'consentRevision',p_expected_consent_revision,
  'policy',p_policy,'validForMs',valid_ms);
END
$reserve$;

DO $privileges$
DECLARE r record; grantee_sql text;
BEGIN
 FOR r IN SELECT DISTINCT c.oid,a.grantee FROM pg_class c
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
  WHERE c.oid IN('public.circle_message_ai_allowance'::regclass,'public.circle_message_ai_attempts'::regclass)
   AND a.grantee<>c.relowner LOOP
  grantee_sql:=CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
  EXECUTE format('REVOKE ALL ON TABLE %s FROM %s RESTRICT',r.oid::regclass,grantee_sql);
 END LOOP;
 FOR r IN SELECT a.grantee FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.oid='public.soe_circle_message_ai_reserve(uuid,uuid,uuid,uuid,bigint,text,bigint,text)'::regprocedure
   AND a.grantee<>p.proowner LOOP
  grantee_sql:=CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
  EXECUTE 'REVOKE ALL ON FUNCTION public.soe_circle_message_ai_reserve(uuid,uuid,uuid,uuid,bigint,text,bigint,text) FROM '||grantee_sql||' RESTRICT';
 END LOOP;
 GRANT SELECT ON public.circle_message_ai_allowance TO service_role;
 GRANT UPDATE(lock_marker) ON public.circle_message_ai_allowance TO service_role;
 GRANT SELECT,INSERT ON public.circle_message_ai_attempts TO service_role;
 GRANT EXECUTE ON FUNCTION public.soe_circle_message_ai_reserve(uuid,uuid,uuid,uuid,bigint,text,bigint,text) TO service_role;
 IF NOT has_table_privilege('service_role','public.circle_message_ai_allowance','SELECT')
  OR NOT has_column_privilege('service_role','public.circle_message_ai_allowance','lock_marker','UPDATE')
  OR NOT has_table_privilege('service_role','public.circle_message_ai_attempts','SELECT')
  OR NOT has_table_privilege('service_role','public.circle_message_ai_attempts','INSERT')
  OR has_table_privilege('service_role','public.circle_message_ai_allowance','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.circle_message_ai_allowance'::regclass
   AND attnum>0 AND NOT attisdropped AND attname<>'lock_marker'
   AND has_column_privilege('service_role',attrelid,attnum,'UPDATE'))
  OR has_table_privilege('service_role','public.circle_message_ai_attempts','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  OR has_any_column_privilege('service_role','public.circle_message_ai_attempts','UPDATE,REFERENCES') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message AI allowance service authority requires review.';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles browser WHERE browser.rolname IN('anon','authenticated') AND (
  has_table_privilege(browser.oid,'public.circle_message_ai_allowance','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  OR has_any_column_privilege(browser.oid,'public.circle_message_ai_allowance','SELECT,INSERT,UPDATE,REFERENCES')
  OR has_table_privilege(browser.oid,'public.circle_message_ai_attempts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  OR has_any_column_privilege(browser.oid,'public.circle_message_ai_attempts','SELECT,INSERT,UPDATE,REFERENCES')
  OR has_function_privilege(browser.oid,'public.soe_circle_message_ai_reserve(uuid,uuid,uuid,uuid,bigint,text,bigint,text)','EXECUTE'))) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message AI allowance browser authority remains open.';
 END IF;
END
$privileges$;
COMMIT;
