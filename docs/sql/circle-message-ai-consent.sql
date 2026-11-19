-- UNAPPLIED LOCAL CANDIDATE. No provider call or production approval is implied.
-- Author permission covers only the immutable text of one message under the
-- fixed direct-Anthropic provider/model/disclosure policy. New policy => opt in again.
-- These RPCs never create advice, change moderation, or disclose report notes.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;

DO $preflight$
DECLARE name text;
BEGIN
 IF current_user IN('anon','authenticated','service_role')
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated'))
  OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message AI consent owner or role authority requires review.';
 END IF;
 IF to_regclass('public.circle_message_ai_consents') IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN(
   'soe_circle_message_ai_consent_state','soe_circle_message_ai_consent_set','soe_circle_message_ai_snapshot')) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message AI consent objects already exist; review before applying.';
 END IF;
 FOREACH name IN ARRAY ARRAY['seminar_messages','book_cohorts','circle_message_states','circle_message_reports','circle_reviewer_grants'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||name) AND c.relkind='r'
   AND pg_get_userbyid(c.relowner)=current_user) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message AI consent prerequisites require review.';
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._soe_circle_message_lock(uuid,uuid,uuid)')
   AND NOT prosecdef AND pg_get_userbyid(proowner)=current_user)
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._soe_circle_message_review_authorize(uuid,uuid,uuid)')
   AND NOT prosecdef AND pg_get_userbyid(proowner)=current_user)
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._soe_circle_message_hash(text)')
   AND NOT prosecdef AND pg_get_userbyid(proowner)=current_user) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message AI consent authorization helpers require review.';
 END IF;
END
$preflight$;

CREATE TABLE public.circle_message_ai_consents (
 message_id uuid NOT NULL REFERENCES public.seminar_messages(id) ON DELETE RESTRICT,
 policy text NOT NULL CHECK(policy='anthropic-message-review-v1'),
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 allowed boolean NOT NULL DEFAULT false,
 consent_revision bigint NOT NULL DEFAULT 0 CHECK(consent_revision BETWEEN 0 AND 9007199254740991),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(message_id,policy)
);
COMMENT ON TABLE public.circle_message_ai_consents IS
 'soe-message-ai-consent:v1; fixed direct-Anthropic policy; legacy absence is false/revision zero; no content or advice stored';
ALTER TABLE public.circle_message_ai_consents ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.soe_circle_message_ai_consent_state(p_actor uuid,p_circle_id uuid,p_message_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $state$
DECLARE m public.seminar_messages; s public.circle_message_states; c public.circle_message_ai_consents; h text;
BEGIN
 -- Same cohort -> message -> safety lock order as reporting, withdrawal and review.
 m:=public._soe_circle_message_lock(p_actor,p_circle_id,p_message_id);
 IF m.member_id IS DISTINCT FROM p_actor THEN
  RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Only the author can manage this message permission.';
 END IF;
 SELECT * INTO s FROM public.circle_message_states WHERE message_id=p_message_id;
 h:=public._soe_circle_message_hash(m.content);
 IF h IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message permission source requires review.'; END IF;
 SELECT * INTO c FROM public.circle_message_ai_consents
  WHERE message_id=p_message_id AND policy='anthropic-message-review-v1' FOR SHARE;
 -- A stale stored body hash never constitutes current permission.
 RETURN jsonb_build_object('circleId',p_circle_id,'messageId',p_message_id,
  'allowed',coalesce(c.allowed,false) AND c.content_hash IS NOT DISTINCT FROM h,
  'consentRevision',coalesce(c.consent_revision,0),'policy','anthropic-message-review-v1',
  'contentHash',h,'messageRevision',coalesce(s.revision,0),
  'canEnable',NOT coalesce(s.hidden,false) AND NOT coalesce(s.withdrawn,false)
   AND coalesce(c.consent_revision,0)<9007199254740991);
END
$state$;

CREATE FUNCTION public.soe_circle_message_ai_consent_set(p_actor uuid,p_circle_id uuid,p_message_id uuid,
 p_expected_consent_revision bigint,p_content_hash text,p_policy text,p_allowed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $set$
DECLARE current_state jsonb; c public.circle_message_ai_consents;
BEGIN
 current_state:=public.soe_circle_message_ai_consent_state(p_actor,p_circle_id,p_message_id);
 IF p_expected_consent_revision IS NULL OR p_expected_consent_revision NOT BETWEEN 0 AND 9007199254740991
  OR p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$'
  OR p_policy IS DISTINCT FROM 'anthropic-message-review-v1' OR p_allowed IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Use a valid message permission request.';
 END IF;
 IF (current_state->>'consentRevision')::bigint<>p_expected_consent_revision
  OR current_state->>'contentHash' IS DISTINCT FROM p_content_hash THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message permission changed; read its current state.';
 END IF;
 IF p_allowed AND NOT (current_state->>'canEnable')::boolean THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Permission can only be enabled for a visible message.';
 END IF;
 SELECT * INTO c FROM public.circle_message_ai_consents WHERE message_id=p_message_id AND policy=p_policy FOR UPDATE;
 IF coalesce(c.allowed,false)=p_allowed AND (c.message_id IS NULL OR c.content_hash=p_content_hash) THEN
  RETURN current_state;
 END IF;
 IF p_expected_consent_revision>=9007199254740991 THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message permission revision requires review.';
 END IF;
 INSERT INTO public.circle_message_ai_consents(message_id,policy,content_hash,allowed,consent_revision)
  VALUES(p_message_id,p_policy,p_content_hash,p_allowed,p_expected_consent_revision+1)
  ON CONFLICT(message_id,policy) DO UPDATE SET content_hash=EXCLUDED.content_hash,allowed=EXCLUDED.allowed,
   consent_revision=EXCLUDED.consent_revision,updated_at=clock_timestamp();
 RETURN public.soe_circle_message_ai_consent_state(p_actor,p_circle_id,p_message_id);
END
$set$;

CREATE FUNCTION public.soe_circle_message_ai_snapshot(p_actor uuid,p_circle_id uuid,p_message_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $snapshot$
DECLARE c public.circle_message_ai_consents; m public.seminar_messages; s public.circle_message_states; n bigint; h text;
BEGIN
 -- This existing helper verifies active assignment/conflicts and locks the case.
 -- It internally reads the post for authorization; no body DTO is emitted until
 -- the current opt-in, complete case and withdrawal checks below all pass.
 PERFORM public._soe_circle_message_review_authorize(p_actor,p_circle_id,p_message_id);
 SELECT * INTO c FROM public.circle_message_ai_consents
  WHERE message_id=p_message_id AND policy='anthropic-message-review-v1' FOR SHARE;
 IF NOT FOUND OR NOT c.allowed OR c.consent_revision<1 OR c.consent_revision>=9007199254740991 THEN
  RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='AI advice is not permitted for this message.';
 END IF;
 SELECT * INTO s FROM public.circle_message_states WHERE message_id=p_message_id;
 IF coalesce(s.withdrawn,false) THEN
  RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='AI advice is not permitted for this message.';
 END IF;
 SELECT count(*) INTO n FROM public.circle_message_reports WHERE message_id=p_message_id AND status='open';
 IF n>100 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='The complete message case is required.'; END IF;
 SELECT * INTO m FROM public.seminar_messages WHERE id=p_message_id AND cohort_id=p_circle_id;
 h:=public._soe_circle_message_hash(m.content);
 IF h IS NULL OR h IS DISTINCT FROM c.content_hash OR length(btrim(m.content)) NOT BETWEEN 1 AND 2000
  OR length(m.content)>2000 THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message permission source changed.';
 END IF;
 RETURN jsonb_build_object('circleId',p_circle_id,'messageId',p_message_id,'content',m.content,
  'revision',coalesce(s.revision,0),'contentHash',h,'consentRevision',c.consent_revision,'policy',c.policy);
END
$snapshot$;

DO $privileges$
DECLARE r record; grantee_sql text;
BEGIN
 -- Scrub inherited defaults on only the new objects, including unrelated roles.
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
  WHERE c.oid='public.circle_message_ai_consents'::regclass AND a.grantee<>c.relowner LOOP
  grantee_sql:=CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
  EXECUTE 'REVOKE ALL ON TABLE public.circle_message_ai_consents FROM '||grantee_sql||' RESTRICT';
 END LOOP;
 GRANT SELECT,INSERT,UPDATE ON public.circle_message_ai_consents TO service_role;
 FOR r IN SELECT p.oid,p.oid::regprocedure AS signature,a.grantee FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.pronamespace='public'::regnamespace AND p.proname IN(
   'soe_circle_message_ai_consent_state','soe_circle_message_ai_consent_set','soe_circle_message_ai_snapshot') AND a.grantee<>p.proowner LOOP
  grantee_sql:=CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s RESTRICT',r.signature,grantee_sql);
 END LOOP;
 GRANT EXECUTE ON FUNCTION public.soe_circle_message_ai_consent_state(uuid,uuid,uuid),
  public.soe_circle_message_ai_consent_set(uuid,uuid,uuid,bigint,text,text,boolean),
  public.soe_circle_message_ai_snapshot(uuid,uuid,uuid) TO service_role;
 IF EXISTS(SELECT 1 FROM pg_roles browser WHERE browser.rolname IN('anon','authenticated') AND
  (has_table_privilege(browser.oid,'public.circle_message_ai_consents','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR has_any_column_privilege(browser.oid,'public.circle_message_ai_consents','SELECT,INSERT,UPDATE,REFERENCES')
   OR has_function_privilege(browser.oid,'public.soe_circle_message_ai_consent_state(uuid,uuid,uuid)','EXECUTE')
   OR has_function_privilege(browser.oid,'public.soe_circle_message_ai_consent_set(uuid,uuid,uuid,bigint,text,text,boolean)','EXECUTE')
   OR has_function_privilege(browser.oid,'public.soe_circle_message_ai_snapshot(uuid,uuid,uuid)','EXECUTE'))) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message AI consent browser authority remains open.';
 END IF;
END
$privileges$;
COMMIT;
