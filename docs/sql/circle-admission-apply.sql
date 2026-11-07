-- UNAPPLIED LOCAL CANDIDATE. Requires an approved restore/cutover before hosted use.
-- Add after reading programs, membership intents, the account access guard and
-- circle-legacy-salon-membership.sql. Apply neither candidate to hosted data yet.
-- No account, secret, invitation, reviewer or existing membership is provisioned.
-- Host approval is verified by the trusted server before join_invited is called.
-- The browser has no RPC/table authority. Raw tokens never enter SQL receipts.
-- https://supabase.com/docs/guides/database/functions
-- https://supabase.com/docs/guides/database/postgres/row-level-security
BEGIN;
SET LOCAL search_path=pg_catalog,public;
SET LOCAL lock_timeout='5s';

LOCK TABLE public.book_cohorts,public.book_cohort_members,public.circle_participation_receipts IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE target record;
BEGIN
 IF to_regnamespace('soe_circle_admission_private') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='soe_circle_admission_private' AND pg_get_userbyid(nspowner)=current_user)
  OR (SELECT count(*) FROM pg_proc WHERE pronamespace='soe_circle_admission_private'::regnamespace)<>1
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('soe_circle_admission_private.legacy_salon_join(uuid,uuid)')
   AND prosecdef AND pg_get_userbyid(proowner)=current_user
   AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='a9a407665f672b818edd87eacfdbd46dbf223b807ea125120dc753f5eca070d9')
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.soe_circle_legacy_salon_join(uuid,uuid)')
   AND NOT prosecdef AND pg_get_userbyid(proowner)=current_user
   AND proconfig=ARRAY['search_path=pg_catalog']::text[]
   AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='04bbb9d90e5d8748b430142ffee123808f12d86946ee5e35c7f69774a1a1b551')
  OR EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN('anon','authenticated') AND (
   has_schema_privilege(r.oid,'soe_circle_admission_private','USAGE,CREATE')
   OR has_function_privilege(r.oid,'soe_circle_admission_private.legacy_salon_join(uuid,uuid)','EXECUTE')
   OR has_function_privilege(r.oid,'public.soe_circle_legacy_salon_join(uuid,uuid)','EXECUTE')))
  OR has_schema_privilege('service_role','soe_circle_admission_private','CREATE')
  OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='soe_circle_admission_private'::regnamespace)
  OR to_regclass('soe_account_deletion_private.identity_gate') IS NULL
  OR to_regclass('soe_account_deletion_private.processing') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND (rolbypassrls OR rolsuper))
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls))
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.book_cohorts'::regclass AND attname IN('circle_admission_mode','circle_invitation_revision') AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Circle admission prerequisites require review';
 END IF;
 FOR target IN SELECT * FROM (VALUES
  ('public.soe_circle_create(uuid,uuid,jsonb)','98baac7f8aae9e82a3f5a0795f84732014d37b8bbf971d6364c5b6bee2be2c24'),
  ('public._soe_circle_participation_state(uuid,uuid)','bb49709a47c9641035be09e938e109b5dcc57ac75fe107da946d7190f90ae79d'),
  ('public.soe_circle_join(uuid,uuid,bigint,uuid)','5890382b19e89cc3dfb66a75c107de9199e023759775aa91657937420d90811b')
 ) AS f(signature,digest) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(target.signature)
   AND NOT prosecdef AND pg_get_userbyid(proowner)=current_user
   AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')=target.digest
   AND proconfig=ARRAY['search_path=pg_catalog, public']::text[]) THEN
   RAISE EXCEPTION 'Circle admission predecessor changed: %',target.signature;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN('public.book_cohorts'::regclass,'public.book_cohort_members'::regclass)
  AND (relkind<>'r' OR relispartition OR relhassubclass OR pg_get_userbyid(relowner)<>current_user)) THEN
  RAISE EXCEPTION 'Circle admission table authority requires review';
 END IF;
END $$;

ALTER TABLE public.book_cohorts
 ADD COLUMN circle_admission_mode text NOT NULL DEFAULT 'open'
  CHECK(circle_admission_mode IN('open','host_approval') AND (book_id='soe-circles-path' OR circle_admission_mode='open')),
 ADD COLUMN circle_invitation_revision bigint NOT NULL DEFAULT 1
  CHECK(circle_invitation_revision BETWEEN 1 AND 9007199254740991);

REVOKE ALL ON SCHEMA soe_circle_admission_private FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA soe_circle_admission_private TO service_role;
CREATE FUNCTION soe_circle_admission_private.enabled() RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT true $$;

-- Hold the same gate as account removal before acquiring participation locks.
-- Check all captured identity forms, including a provider-only removal request.
CREATE FUNCTION soe_circle_admission_private.require_actor(p_actor uuid) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Check admission in a read-committed transaction';
 END IF;
 PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Account removal guard unavailable'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.members m WHERE m.id=p_actor AND NOT EXISTS(
  SELECT 1 FROM soe_account_deletion_private.processing p WHERE p.member_id=m.id OR p.auth_user_id=m.supabase_auth_id
   OR (m.wallet_address IS NOT NULL AND p.wallet_hash=sha256(convert_to(lower(m.wallet_address),'UTF8')))
 )) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member unavailable'; END IF;
END $$;

-- Copy only the exact reviewed predecessor, then make bounded substitutions.
-- Private definer implementations replace raw service membership INSERT/UPDATE.
-- Public invoker wrappers retain the old signatures and explicit service ACLs.
DO $$
DECLARE definition text; before text; after text;
BEGIN
 SELECT pg_get_functiondef('soe_circle_admission_private.legacy_salon_join(uuid,uuid)'::regprocedure) INTO definition;
 before:='BEGIN'||E'\n'||' PERFORM public._soe_circle_participation_actor(p_actor);';
 after:='BEGIN'||E'\n'||' PERFORM soe_circle_admission_private.require_actor(p_actor);'||E'\n'||' PERFORM public._soe_circle_participation_actor(p_actor);';
 IF length(definition)-length(replace(definition,before,''))<>length(before) THEN RAISE EXCEPTION 'Legacy join actor guard changed'; END IF;
 EXECUTE replace(definition,before,after);

 SELECT pg_get_functiondef('public.soe_circle_create(uuid,uuid,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'FUNCTION public.soe_circle_create(', 'FUNCTION soe_circle_admission_private.create_circle(');
 before:='BEGIN'||E'\n'||' PERFORM public._soe_circle_participation_actor(p_actor);';
 after:='BEGIN'||E'\n'||' PERFORM soe_circle_admission_private.require_actor(p_actor);'||E'\n'||' PERFORM public._soe_circle_participation_actor(p_actor);';
 IF length(definition)-length(replace(definition,before,''))<>length(before) THEN RAISE EXCEPTION 'Creation actor guard changed'; END IF;
 definition:=replace(definition,before,after);
 before:='''onlineUrl'',''readingProgram'']'; after:='''onlineUrl'',''readingProgram'',''admissionMode'']';
 IF length(definition)-length(replace(definition,before,''))<>length(before) THEN RAISE EXCEPTION 'Creation field guard changed'; END IF;
 definition:=replace(definition,before,after);
 before:=' format:=p_input->>''format'';';
 after:=' IF p_input ? ''admissionMode'' AND (jsonb_typeof(p_input->''admissionMode'') IS DISTINCT FROM ''string'' OR p_input->>''admissionMode'' NOT IN(''open'',''host_approval'')) THEN RAISE EXCEPTION USING ERRCODE=''PT400'',MESSAGE=''Invalid admission mode''; END IF;'||E'\n'||
  ' IF coalesce(p_input->>''admissionMode'',''open'')=''host_approval'' AND NOT soe_circle_admission_private.enabled() THEN RAISE EXCEPTION USING ERRCODE=''PT503'',MESSAGE=''Invitations unavailable''; END IF;'||E'\n'||before;
 IF length(definition)-length(replace(definition,before,''))<>length(before) THEN RAISE EXCEPTION 'Creation mode guard changed'; END IF;
 definition:=replace(definition,before,after);
 before:='circle_participation_revision,circle_reading_program)'; after:='circle_participation_revision,circle_reading_program,circle_admission_mode)';
 IF length(definition)-length(replace(definition,before,''))<>length(before) THEN RAISE EXCEPTION 'Creation columns changed'; END IF;
 definition:=replace(definition,before,after);
 before:='false,1,p_input->''readingProgram'')'; after:='false,1,p_input->''readingProgram'',coalesce(p_input->>''admissionMode'',''open''))';
 IF length(definition)-length(replace(definition,before,''))<>length(before) THEN RAISE EXCEPTION 'Creation values changed'; END IF;
 EXECUTE replace(definition,before,after);
 ALTER FUNCTION soe_circle_admission_private.create_circle(uuid,uuid,jsonb) SECURITY DEFINER;

 SELECT pg_get_functiondef('public.soe_circle_join(uuid,uuid,bigint,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'FUNCTION public.soe_circle_join(', 'FUNCTION soe_circle_admission_private.join_open(');
 before:='BEGIN'||E'\n'||' PERFORM public._soe_circle_participation_actor(p_actor);';
 after:='BEGIN'||E'\n'||' PERFORM soe_circle_admission_private.require_actor(p_actor);'||E'\n'||' PERFORM public._soe_circle_participation_actor(p_actor);';
 IF length(definition)-length(replace(definition,before,''))<>length(before) THEN RAISE EXCEPTION 'Join actor guard changed'; END IF;
 definition:=replace(definition,before,after);
 before:=' IF c.circle_hidden THEN';
 after:=' IF c.circle_admission_mode<>''open'' THEN RAISE EXCEPTION USING ERRCODE=''PT403'',MESSAGE=''A host-approved invitation is required''; END IF;'||E'\n'||before;
 IF length(definition)-length(replace(definition,before,''))<>length(before) THEN RAISE EXCEPTION 'Join visibility guard changed'; END IF;
 EXECUTE replace(definition,before,after);
 ALTER FUNCTION soe_circle_admission_private.join_open(uuid,uuid,bigint,uuid) SECURITY DEFINER;

 SELECT pg_get_functiondef('public._soe_circle_participation_state(uuid,uuid)'::regprocedure) INTO definition;
 before:='''canJoin'',p_actor IS NOT NULL AND NOT member';
 after:='''canJoin'',c.circle_admission_mode=''open'' AND p_actor IS NOT NULL AND NOT member';
 IF length(definition)-length(replace(definition,before,''))<>length(before) THEN RAISE EXCEPTION 'Participation capability guard changed'; END IF;
 EXECUTE replace(definition,before,after);
END $$;

CREATE OR REPLACE FUNCTION public.soe_circle_create(p_actor uuid,p_request_id uuid,p_input jsonb) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT soe_circle_admission_private.create_circle(p_actor,p_request_id,p_input);
$$;
CREATE OR REPLACE FUNCTION public.soe_circle_join(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT soe_circle_admission_private.join_open(p_actor,p_circle_id,p_expected_revision,p_request_id);
$$;

CREATE FUNCTION soe_circle_admission_private.review_invitation(p_actor uuid,p_circle_id uuid,p_target uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.book_cohorts; state jsonb; label text;
BEGIN
 PERFORM soe_circle_admission_private.require_actor(p_actor);
 IF NOT soe_circle_admission_private.enabled() THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Invitations unavailable'; END IF;
 SELECT * INTO c FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' FOR SHARE;
 IF NOT FOUND OR c.created_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Host controls unavailable'; END IF;
 PERFORM soe_circle_admission_private.require_actor(p_target);
 state:=public._soe_circle_participation_state(p_actor,c.id);
 IF c.circle_admission_mode<>'host_approval' OR c.circle_hidden OR (state->>'ended')::boolean
  OR NOT public._soe_circle_participation_header_usable(c)
  OR EXISTS(SELECT 1 FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_target) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invitation scope changed';
 END IF;
 SELECT left(public._soe_circle_message_name(display_name),40) INTO label FROM public.members WHERE id=p_target;
 RETURN jsonb_build_object('memberId',p_actor,'circleId',c.id,'circleRevision',c.circle_participation_revision,
  'invitationRevision',c.circle_invitation_revision,'targetMemberId',p_target,'targetLabel',coalesce(label,'An explorer'));
END $$;
CREATE FUNCTION public.soe_circle_invitation_review(p_actor uuid,p_circle_id uuid,p_target uuid) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT soe_circle_admission_private.review_invitation(p_actor,p_circle_id,p_target);
$$;

CREATE FUNCTION soe_circle_admission_private.join_invited(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,p_request_id uuid,
 p_host uuid,p_invitation_revision bigint,p_approval_nonce uuid,p_proof_hash text,p_expires_at timestamptz) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.book_cohorts; payload jsonb; replay jsonb; n bigint; state jsonb;
BEGIN
 PERFORM soe_circle_admission_private.require_actor(p_actor);
 PERFORM public._soe_circle_participation_actor(p_actor);
 IF p_host IS NULL OR p_approval_nonce IS NULL OR p_proof_hash IS NULL OR p_proof_hash !~ '^[a-f0-9]{64}$'
  OR p_invitation_revision IS NULL OR p_invitation_revision NOT BETWEEN 1 AND 9007199254740991
  OR p_expires_at IS NULL OR NOT isfinite(p_expires_at) THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid invitation attestation';
 END IF;
 -- Receipt payload retains only the recipient's opaque approval reference.
 -- Host/target claims and the raw signed token are deliberately not retained.
 payload:=jsonb_build_object('action','join_invited','circleId',p_circle_id,'expectedRevision',p_expected_revision,
  'approvalNonce',p_approval_nonce,'proofHash',p_proof_hash);
 replay:=public._soe_circle_participation_replay(p_actor,p_request_id,payload);
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF NOT soe_circle_admission_private.enabled() THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Invitations unavailable'; END IF;
 PERFORM soe_circle_admission_private.require_actor(p_host);
 c:=public._soe_circle_participation_lock(p_actor,p_circle_id,p_expected_revision);
 state:=public._soe_circle_participation_state(p_actor,c.id);
 IF c.circle_admission_mode<>'host_approval' OR c.created_by IS DISTINCT FROM p_host
  OR c.circle_invitation_revision<>p_invitation_revision OR p_expires_at<=clock_timestamp()
  OR p_expires_at>clock_timestamp()+interval '24 hours 1 minute'
  OR c.circle_hidden OR (state->>'ended')::boolean OR NOT public._soe_circle_participation_header_usable(c) THEN
  RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Invitation unavailable';
 END IF;
 IF EXISTS(SELECT 1 FROM public.circle_participation_receipts r WHERE r.actor_member_id=p_actor
  AND r.payload->>'approvalNonce'=p_approval_nonce::text) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invitation was already used; only the exact request can be retried';
 END IF;
 IF NOT (state->>'isMember')::boolean THEN
  SELECT count(*) INTO n FROM public.book_cohort_members WHERE cohort_id=c.id;
  IF c.max_members IS NULL OR c.max_members NOT BETWEEN 3 AND 12 OR n>=c.max_members THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='No place is available';
  END IF;
  INSERT INTO public.book_cohort_members(cohort_id,member_id) VALUES(c.id,p_actor);
 END IF;
 PERFORM public._soe_circle_participation_bump(c.id);
 RETURN public._soe_circle_participation_remember(p_actor,c.id,p_request_id,payload,public._soe_circle_participation_event('join',true,false));
END $$;
CREATE FUNCTION public.soe_circle_join_invited(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,p_request_id uuid,
 p_host uuid,p_invitation_revision bigint,p_approval_nonce uuid,p_proof_hash text,p_expires_at timestamptz) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT soe_circle_admission_private.join_invited(p_actor,p_circle_id,p_expected_revision,p_request_id,
  p_host,p_invitation_revision,p_approval_nonce,p_proof_hash,p_expires_at);
$$;

CREATE FUNCTION soe_circle_admission_private.revoke_invitations(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,
 p_expected_invitation_revision bigint,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.book_cohorts; payload jsonb; replay jsonb; result jsonb; invitation_revision bigint;
BEGIN
 PERFORM soe_circle_admission_private.require_actor(p_actor);
 PERFORM public._soe_circle_participation_actor(p_actor);
 IF p_expected_invitation_revision IS NULL OR p_expected_invitation_revision NOT BETWEEN 1 AND 9007199254740991 THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid invitation revision';
 END IF;
 payload:=jsonb_build_object('action','revokeInvitations','circleId',p_circle_id,'expectedRevision',p_expected_revision,
  'expectedInvitationRevision',p_expected_invitation_revision);
 replay:=public._soe_circle_participation_replay(p_actor,p_request_id,payload);
 IF replay IS NOT NULL THEN
  SELECT circle_invitation_revision INTO invitation_revision FROM public.book_cohorts WHERE id=p_circle_id;
  RETURN replay||jsonb_build_object('invitationRevision',invitation_revision);
 END IF;
 c:=public._soe_circle_participation_lock(p_actor,p_circle_id,p_expected_revision);
 IF c.created_by IS DISTINCT FROM p_actor OR c.circle_admission_mode<>'host_approval' THEN
  RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Host controls unavailable';
 END IF;
 IF c.circle_invitation_revision<>p_expected_invitation_revision OR c.circle_invitation_revision>=9007199254740991 THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invitation revision changed';
 END IF;
 UPDATE public.book_cohorts SET circle_invitation_revision=circle_invitation_revision+1 WHERE id=c.id
  RETURNING circle_invitation_revision INTO invitation_revision;
 PERFORM public._soe_circle_participation_bump(c.id);
 result:=public._soe_circle_participation_remember(p_actor,c.id,p_request_id,payload,
  jsonb_build_object('action','revokeInvitations','invitationRevision',invitation_revision));
 RETURN result||jsonb_build_object('invitationRevision',invitation_revision);
END $$;
CREATE FUNCTION public.soe_circle_invitation_revoke(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,
 p_expected_invitation_revision bigint,p_request_id uuid) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT soe_circle_admission_private.revoke_invitations(p_actor,p_circle_id,p_expected_revision,p_expected_invitation_revision,p_request_id);
$$;

-- A raw insertion/upsert must not bypass host approval, even with the server's
-- existing role. Preserve unrelated old-column updates; new admission columns
-- are writable only inside the reviewed private functions.
DO $$
DECLARE columns text; target record;
BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns FROM pg_attribute
  WHERE attrelid='public.book_cohort_members'::regclass AND attnum>0 AND NOT attisdropped;
 REVOKE INSERT,UPDATE ON public.book_cohort_members FROM PUBLIC,anon,authenticated,service_role;
 EXECUTE format('REVOKE INSERT(%s),UPDATE(%s) ON public.book_cohort_members FROM PUBLIC,anon,authenticated,service_role',columns,columns);
 -- Existing access checks lock membership rows. PostgreSQL requires an UPDATE
 -- privilege for that lock; the surrogate id cannot change member/cohort scope.
 GRANT UPDATE(id) ON public.book_cohort_members TO service_role;
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns FROM pg_attribute
  WHERE attrelid='public.book_cohorts'::regclass AND attnum>0 AND NOT attisdropped;
 REVOKE UPDATE ON public.book_cohorts FROM service_role;
 EXECUTE format('REVOKE UPDATE(%s) ON public.book_cohorts FROM service_role',columns);
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns FROM pg_attribute
  WHERE attrelid='public.book_cohorts'::regclass AND attnum>0 AND NOT attisdropped
   AND attname NOT IN('circle_admission_mode','circle_invitation_revision');
 EXECUTE format('GRANT UPDATE(%s) ON public.book_cohorts TO service_role',columns);
 FOR target IN SELECT p.oid::regprocedure AS signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='soe_circle_admission_private' OR (n.nspname='public' AND p.proname IN(
   'soe_circle_create','soe_circle_join','soe_circle_invitation_review','soe_circle_join_invited','soe_circle_invitation_revoke','soe_circle_legacy_salon_join')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',target.signature);
  IF target.nspname='public' OR target.proname IN('create_circle','join_open','review_invitation','join_invited','revoke_invitations','legacy_salon_join') THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',target.signature);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN('anon','authenticated','service_role')
  AND (has_table_privilege(r.oid,'public.book_cohort_members','INSERT,UPDATE')
   OR has_any_column_privilege(r.oid,'public.book_cohort_members','INSERT')
   OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.book_cohort_members'::regclass
    AND a.attnum>0 AND NOT a.attisdropped AND (r.rolname<>'service_role' OR a.attname<>'id')
    AND has_column_privilege(r.oid,a.attrelid,a.attnum,'UPDATE'))))
  OR has_column_privilege('service_role','public.book_cohorts','circle_admission_mode','UPDATE')
  OR has_column_privilege('service_role','public.book_cohorts','circle_invitation_revision','UPDATE') THEN
  RAISE EXCEPTION 'Inherited membership/admission write authority requires review';
 END IF;
END $$;
COMMIT;
