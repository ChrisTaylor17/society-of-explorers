-- UNAPPLIED LOCAL REVIEW CANDIDATE. No production execution authorized.
-- After the reviewed participation + reading-program chain. Preserves all RSVP rows and receipts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
DO $attendance$
DECLARE role_name text; installed boolean; proc_oid oid; dependency record;
BEGIN
 LOCK TABLE public.book_cohorts,public.circle_rsvps,public.circle_participation_receipts IN ACCESS EXCLUSIVE MODE;

 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.circle_rsvps') AND relkind='r' AND NOT relispartition AND relrowsecurity AND pg_get_userbyid(relowner)=current_user)
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated','service_role'))<>3
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls))
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper)
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated','service_role')) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle RSVP ownership or roles require review.';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.circle_rsvps'::regclass)
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.circle_rsvps'::regclass AND NOT tgisinternal)
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='public.circle_rsvps'::regclass)
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.circle_rsvps'::regclass AND NOT attisdropped AND attacl IS NOT NULL)
  OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.circle_rsvps'::regclass AND a.grantee<>c.relowner
    AND NOT(a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND NOT a.is_grantable)) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle RSVP policies, rules, triggers or grants require review.';
 END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(role_name,'public.circle_rsvps','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege(role_name,'public.circle_rsvps','SELECT,INSERT,UPDATE,REFERENCES') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Raw browser RSVP access must be contained first.';
  END IF;
 END LOOP;
 IF NOT has_table_privilege('service_role','public.circle_rsvps','SELECT')
  OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.circle_rsvps'::regclass AND NOT attisdropped AND attnotnull AND
   ((attname IN('id','cohort_id','member_id') AND atttypid='uuid'::regtype) OR (attname='meeting_date' AND atttypid='date'::regtype) OR (attname='status' AND atttypid='text'::regtype)))<>5
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.circle_rsvps'::regclass AND contype='u' AND convalidated AND NOT condeferrable
   AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.circle_rsvps'::regclass AND attname='cohort_id'),(SELECT attnum FROM pg_attribute WHERE attrelid='public.circle_rsvps'::regclass AND attname='member_id'),(SELECT attnum FROM pg_attribute WHERE attrelid='public.circle_rsvps'::regclass AND attname='meeting_date')]::smallint[])
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.book_cohorts') AND attname='circle_participation_revision' AND atttypid='bigint'::regtype AND attnotnull AND NOT attisdropped)
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.circle_participation_receipts') AND tgname='circle_participation_receipts_immutable' AND tgenabled='O') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle RSVP schema or receipt prerequisites require review.';
 END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('soe_circle_rsvp','soe_circle_leave'))<>2
  OR to_regprocedure('public.soe_circle_rsvp(uuid,uuid,bigint,uuid,date,text)') IS NULL OR to_regprocedure('public.soe_circle_leave(uuid,uuid,bigint,uuid)') IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle RSVP function identity requires review.';
 END IF;
 installed:=(SELECT prosecdef OR COALESCE(obj_description(oid,'pg_proc')='soe-circle-attendance:v1:rsvp',false) FROM pg_proc WHERE oid='public.soe_circle_rsvp(uuid,uuid,bigint,uuid,date,text)'::regprocedure);
 FOREACH proc_oid IN ARRAY ARRAY['public.soe_circle_rsvp(uuid,uuid,bigint,uuid,date,text)'::regprocedure::oid,'public.soe_circle_leave(uuid,uuid,bigint,uuid)'::regprocedure::oid] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=proc_oid AND p.prosecdef=installed AND p.provolatile='v' AND p.prokind='f'
    AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargmodes IS NULL
    AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AND p.prorettype='jsonb'::regtype AND pg_get_userbyid(p.proowner)=current_user
    AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
    AND ((p.proname='soe_circle_rsvp' AND p.pronargs=6 AND p.proargnames=ARRAY['p_actor','p_circle_id','p_expected_revision','p_request_id','p_date','p_status']::text[]
      AND md5(p.prosrc)=CASE WHEN installed THEN 'a3e9ca5ff92110f43f8a6524de7f226f' ELSE '5da042cbfc961e4e7a40475b4f6252f8' END
      AND (NOT installed OR obj_description(p.oid,'pg_proc')='soe-circle-attendance:v1:rsvp'))
     OR (p.proname='soe_circle_leave' AND p.pronargs=4 AND p.proargnames=ARRAY['p_actor','p_circle_id','p_expected_revision','p_request_id']::text[] AND md5(p.prosrc)='12f19e8fdac1699e683e81999d5edd7c'
      AND (NOT installed OR obj_description(p.oid,'pg_proc')='soe-circle-attendance:v1:leave'))))
   OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=proc_oid AND a.grantee<>p.proowner
     AND NOT(a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle RSVP function definition or grants require review.';
  END IF;
 END LOOP;
 IF NOT has_function_privilege('service_role','public.soe_circle_leave(uuid,uuid,bigint,uuid)','EXECUTE') OR (NOT installed AND NOT has_function_privilege('service_role','public.soe_circle_rsvp(uuid,uuid,bigint,uuid,date,text)','EXECUTE')) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle RSVP prerequisite execution grants require review.';
 END IF;
 IF installed AND EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.circle_rsvps'::regclass AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND a.privilege_type<>'SELECT') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle RSVP direct-write barrier has drifted.';
 END IF;

 FOR dependency IN SELECT * FROM(VALUES
   ('public._soe_circle_participation_immutable()','eb15ca0a67547d16ef08d8ab7edb5041'),
   ('public._soe_circle_participation_dates(public.book_cohorts)','14634ce676356ed98160afcf748c62f5'),
   ('public._soe_circle_participation_today(public.book_cohorts)','fb2f4aede9b05c056d1f6796f792e3da'),
   ('public._soe_circle_participation_header_usable(public.book_cohorts)','698e93c04104de355b46a0b590bbf719'),
   ('public._soe_circle_participation_state(uuid,uuid)','4089382df51235150b6814cec631a9eb'),
   ('public._soe_circle_participation_actor(uuid)','94a43d204590d37dcb1b140088587b11'),
   ('public._soe_circle_participation_lock(uuid,uuid,bigint)','5db5b50f748aee8c353cea264fb32320'),
   ('public._soe_circle_participation_bump(uuid)','dd12beb6bed69272b861fc457bd7facf'),
   ('public._soe_circle_participation_replay(uuid,uuid,jsonb)','f4753055baf628ef930b50dc6c894615'),
   ('public._soe_circle_participation_remember(uuid,uuid,uuid,jsonb,jsonb)','be7a7692ccc670e933d2ac7648222fe9'),
   ('public._soe_circle_participation_event(text,boolean,boolean,date,text)','938a4dce086c40a7190959938f8ee4f2'),
   ('public._soe_circle_participation_active_hosted(uuid)','62ea11c71ed7fbe6f16fbf54daf3c786'),
   ('public._soe_circle_participation_header(uuid,uuid)','2f562538d8b4460a70323a620f8499fa'),
   ('public._soe_circle_participation_management(uuid,uuid)','99943337ac4d5889df4e311c569f1238'),
   ('public._soe_circle_reading_program_valid(jsonb)','fb4623ce72b81f2b56b7743c44ab672c'),
   ('public._soe_circle_reading_program_length(jsonb,text)','074ad2f164571cd1eaa7957a6ea7a2cc'),
   ('public._soe_circle_reading_program_guard()','7dac70ed40e9b301256a62941cec1dce')
 ) AS expected(signature,body_hash) LOOP
  proc_oid:=to_regprocedure(dependency.signature);
  IF proc_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=proc_oid AND NOT p.prosecdef
    AND pg_get_userbyid(p.proowner)=current_user AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AND md5(p.prosrc)=dependency.body_hash) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle RSVP helper definitions require review.';
  END IF;
 END LOOP;

 IF NOT installed THEN
  EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.soe_circle_rsvp(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,p_request_id uuid,p_date date,p_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; payload jsonb; replay jsonb; state jsonb; dates date[];
BEGIN
 PERFORM public._soe_circle_participation_actor(p_actor);
 payload:=jsonb_build_object('action','rsvp','circleId',p_circle_id,'expectedRevision',p_expected_revision,'date',p_date,'status',p_status);
 replay:=public._soe_circle_participation_replay(p_actor,p_request_id,payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF p_status IS NULL OR p_status NOT IN('going','not_going') OR p_date IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid RSVP'; END IF;
 c:=public._soe_circle_participation_lock(p_actor,p_circle_id,p_expected_revision); state:=public._soe_circle_participation_state(p_actor,c.id);
 IF c.circle_hidden THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 IF NOT (state->>'isMember')::boolean THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Current membership required'; END IF;
 IF NOT public._soe_circle_participation_header_usable(c) THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Circle configuration unavailable'; END IF;
 IF NOT (state->>'canRsvp')::boolean THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='This Circle is closed to RSVPs'; END IF;
 dates:=public._soe_circle_participation_dates(c);
 IF NOT(p_date=ANY(dates)) OR p_date<public._soe_circle_participation_today(c) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Choose an upcoming configured meeting'; END IF;
 INSERT INTO public.circle_rsvps(cohort_id,member_id,meeting_date,status) VALUES(c.id,p_actor,p_date,p_status)
 ON CONFLICT(cohort_id,member_id,meeting_date) DO UPDATE SET status=excluded.status,updated_at=clock_timestamp() WHERE circle_rsvps.status IS DISTINCT FROM excluded.status;
  -- Every new accepted response confirms ordering, including same-value RSVP.
  -- An older held opposite response must not remain eligible after this receipt.
  -- Exact request replay returned above never reaches this revision advance.
  PERFORM public._soe_circle_participation_bump(c.id);
 RETURN public._soe_circle_participation_remember(p_actor,c.id,p_request_id,payload,public._soe_circle_participation_event('rsvp',true,false,p_date,p_status));
END $$;
CREATE OR REPLACE FUNCTION public.soe_circle_leave(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; payload jsonb; replay jsonb; state jsonb; removed integer; rsvps integer;
BEGIN
 PERFORM public._soe_circle_participation_actor(p_actor);
 payload:=jsonb_build_object('action','leave','circleId',p_circle_id,'expectedRevision',p_expected_revision);
 replay:=public._soe_circle_participation_replay(p_actor,p_request_id,payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 c:=public._soe_circle_participation_lock(p_actor,p_circle_id,p_expected_revision); state:=public._soe_circle_participation_state(p_actor,c.id);
 IF c.circle_hidden AND NOT (state->>'isMember')::boolean AND NOT (state->>'isHost')::boolean THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 DELETE FROM public.circle_rsvps WHERE cohort_id=c.id AND member_id=p_actor; GET DIAGNOSTICS rsvps=ROW_COUNT;
 DELETE FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor; GET DIAGNOSTICS removed=ROW_COUNT;
 IF removed>0 OR rsvps>0 THEN PERFORM public._soe_circle_participation_bump(c.id); END IF;
 RETURN public._soe_circle_participation_remember(p_actor,c.id,p_request_id,payload,public._soe_circle_participation_event('leave',false,c.status='completed'));
END $$;$ddl$;
  COMMENT ON FUNCTION public.soe_circle_rsvp(uuid,uuid,bigint,uuid,date,text) IS 'soe-circle-attendance:v1:rsvp';
  COMMENT ON FUNCTION public.soe_circle_leave(uuid,uuid,bigint,uuid) IS 'soe-circle-attendance:v1:leave';
 END IF;
 -- No canonical application caller writes this table directly. Leave remains
 -- available through its unchanged reviewed body under the same owner boundary.
 REVOKE ALL PRIVILEGES ON public.circle_rsvps FROM service_role;
 GRANT SELECT ON public.circle_rsvps TO service_role;
 REVOKE ALL PRIVILEGES ON FUNCTION public.soe_circle_rsvp(uuid,uuid,bigint,uuid,date,text),public.soe_circle_leave(uuid,uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.soe_circle_rsvp(uuid,uuid,bigint,uuid,date,text),public.soe_circle_leave(uuid,uuid,bigint,uuid) TO service_role;
END
$attendance$;
SELECT 'circle_attendance_applied_locally_or_already_current' AS result;
COMMIT;
