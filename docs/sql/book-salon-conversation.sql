-- UNAPPLIED LOCAL CANDIDATE. No production application authorized.
-- Requires the strict legacy Circle baseline and private-by-default profiles.
-- Ordinary salon conversations remain public. Circles never use these RPCs.
-- No rows, legacy sender fields, foreign keys or existing grants are rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
DO $preflight$
DECLARE browser text; target text;
BEGIN
 IF to_regclass('public.soe_circle_legacy_baseline_v1_state') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper)
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated')) THEN
  RAISE EXCEPTION 'Salon service and browser authority requires review';
 END IF;
 FOREACH target IN ARRAY ARRAY['members','book_cohorts','book_cohort_members','seminar_messages'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||target) AND relkind='r' AND NOT relispartition
    AND relrowsecurity AND pg_get_userbyid(relowner)=current_user)
    OR NOT has_table_privilege('service_role','public.'||target,'SELECT') THEN
   RAISE EXCEPTION 'Salon table ownership, containment or service read requires review: %',target;
  END IF;
  FOREACH browser IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_schema_privilege(browser,'public','CREATE')
     OR has_table_privilege(browser,'public.'||target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_any_column_privilege(browser,'public.'||target,'SELECT,INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'Raw salon/member browser authority must be contained first';
   END IF;
  END LOOP;
 END LOOP;
 IF NOT has_table_privilege('service_role','public.seminar_messages','INSERT')
  OR NOT has_any_column_privilege('service_role','public.book_cohorts','UPDATE')
  OR NOT has_any_column_privilege('service_role','public.book_cohort_members','UPDATE')
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='profile_visibility' AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped)
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.seminar_messages'::regclass AND attname='member_name' AND atttypid='text'::regtype AND NOT attnotnull AND NOT atthasdef AND NOT attisdropped)
  OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN('_soe_book_salon_plain','_soe_book_salon_name','soe_book_salon_messages_read','soe_book_salon_messages_post')) THEN
  RAISE EXCEPTION 'Salon prerequisites or function collision requires review';
 END IF;
END $preflight$;

-- PostgreSQL counts Unicode scalars, while the browser limit counts UTF-16
-- units. The second term counts supplementary scalars once more. No clipping.
CREATE FUNCTION public._soe_book_salon_plain(p_value text,p_limit integer,p_single boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $plain$
 SELECT p_value IS NOT NULL AND length(p_value)<=p_limit
  AND length(p_value)+length(regexp_replace(p_value,U&'[\0001-\FFFF]','','g'))<=p_limit
  AND p_value !~ CASE WHEN p_single THEN '[\x01-\x1f\x7f]' ELSE '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' END;
$plain$;
CREATE FUNCTION public._soe_book_salon_name(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $name$
 SELECT CASE WHEN p_value IS NULL THEN 'Unattributed message'
  WHEN public._soe_book_salon_plain(btrim(p_value),200,true) AND length(btrim(p_value))>0 AND strpos(p_value,'@')=0
  THEN btrim(p_value) ELSE 'Explorer' END;
$name$;

CREATE FUNCTION public.soe_book_salon_messages_read(p_actor uuid,p_cohort_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $read$
DECLARE c public.book_cohorts; result jsonb;
BEGIN
 -- The route's preliminary classification is advisory. Recheck here so an
 -- ordinary-to-Circle change never turns this public reader into Circle access.
 SELECT * INTO c FROM public.book_cohorts WHERE id=p_cohort_id AND book_id<>'soe-circles-path' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Salon unavailable'; END IF;
 IF NOT public._soe_book_salon_plain(c.book_id,200,true) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Salon metadata requires review';
 END IF;
 WITH published AS MATERIALIZED (
  SELECT m.id,public._soe_book_salon_name(m.display_name) AS name
   FROM public.members m WHERE m.profile_visibility='public'
    AND EXISTS(SELECT 1 FROM public.book_cohort_members x WHERE x.cohort_id=c.id AND x.member_id=m.id)
   ORDER BY m.id LIMIT 51
 ), recent AS MATERIALIZED (
  SELECT id,member_id,member_name,content,created_at FROM public.seminar_messages
   WHERE cohort_id=c.id ORDER BY created_at DESC NULLS LAST,id DESC LIMIT 101
 ), shown AS MATERIALIZED (SELECT * FROM recent ORDER BY created_at DESC NULLS LAST,id DESC LIMIT 100)
 SELECT jsonb_build_object('cohort',jsonb_build_object('id',c.id,'book_id',c.book_id,
  'title',CASE WHEN public._soe_book_salon_plain(c.title,200,true) THEN c.title ELSE NULL END,
  'description',CASE WHEN public._soe_book_salon_plain(c.description,2000,false) THEN c.description ELSE NULL END,
  'max_members',CASE WHEN c.max_members>0 THEN c.max_members ELSE NULL END,
  'start_date',CASE WHEN isfinite(c.start_date) THEN c.start_date ELSE NULL END,
  'thinker_id',CASE WHEN public._soe_book_salon_plain(c.thinker_id,100,true) THEN c.thinker_id ELSE NULL END,
  'status',CASE WHEN public._soe_book_salon_plain(c.status,40,true) THEN c.status ELSE NULL END,
  'created_at',CASE WHEN isfinite(c.created_at) THEN c.created_at ELSE NULL END),
  'membership_count',(SELECT count(*) FROM public.book_cohort_members WHERE cohort_id=c.id),
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'members',jsonb_build_object('display_name',p.name)) ORDER BY p.id)
   FROM (SELECT * FROM published ORDER BY id LIMIT 50) p),'[]'::jsonb),
  'roster',jsonb_build_object('limit',50,'truncated',(SELECT count(*)>50 FROM published)),
  'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'member_name',public._soe_book_salon_name(s.member_name),
    'content',CASE WHEN public._soe_book_salon_plain(s.content,2000,false) THEN s.content ELSE '[Message unavailable.]' END,
    'content_available',public._soe_book_salon_plain(s.content,2000,false),
    'created_at',CASE WHEN isfinite(s.created_at) THEN s.created_at ELSE NULL END,'is_mine',coalesce(s.member_id=p_actor,false))
    ORDER BY s.created_at ASC NULLS FIRST,s.id ASC) FROM shown s),'[]'::jsonb),
  'history',jsonb_build_object('limit',100,'window','latest','truncated',(SELECT count(*)>100 FROM recent))) INTO result;
 RETURN result;
END $read$;

CREATE FUNCTION public.soe_book_salon_messages_post(p_actor uuid,p_cohort_id uuid,p_content text,p_member_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $post$
DECLARE saved public.seminar_messages;
BEGIN
 IF p_actor IS NULL OR NOT public._soe_book_salon_plain(p_content,2000,false) OR length(btrim(p_content))=0 THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid salon post';
 END IF;
 PERFORM 1 FROM public.book_cohorts WHERE id=p_cohort_id AND book_id<>'soe-circles-path' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Salon unavailable'; END IF;
 PERFORM 1 FROM public.book_cohort_members x JOIN public.members m ON m.id=x.member_id
  WHERE x.cohort_id=p_cohort_id AND x.member_id=p_actor FOR SHARE OF x;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Join this salon before posting'; END IF;
 INSERT INTO public.seminar_messages(cohort_id,member_id,member_name,content)
  VALUES(p_cohort_id,p_actor,public._soe_book_salon_name(p_member_name),p_content) RETURNING * INTO saved;
 RETURN jsonb_build_object('outcome','confirmed','cohortId',p_cohort_id,'message',jsonb_build_object('id',saved.id,
  'member_name',saved.member_name,'content',saved.content,'content_available',true,'created_at',saved.created_at,'is_mine',true));
END $post$;

REVOKE ALL ON FUNCTION public._soe_book_salon_plain(text,integer,boolean),public._soe_book_salon_name(text),
 public.soe_book_salon_messages_read(uuid,uuid),public.soe_book_salon_messages_post(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public._soe_book_salon_plain(text,integer,boolean),public._soe_book_salon_name(text),
 public.soe_book_salon_messages_read(uuid,uuid),public.soe_book_salon_messages_post(uuid,uuid,text,text) TO service_role;
COMMENT ON FUNCTION public._soe_book_salon_plain(text,integer,boolean) IS 'soe-book-salon-conversation:v1:owned';
COMMENT ON FUNCTION public._soe_book_salon_name(text) IS 'soe-book-salon-conversation:v1:owned';
COMMENT ON FUNCTION public.soe_book_salon_messages_read(uuid,uuid) IS 'soe-book-salon-conversation:v1:owned';
COMMENT ON FUNCTION public.soe_book_salon_messages_post(uuid,uuid,text,text) IS 'soe-book-salon-conversation:v1:owned';
DO $access$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid IN('public._soe_book_salon_plain(text,integer,boolean)'::regprocedure,'public._soe_book_salon_name(text)'::regprocedure,
    'public.soe_book_salon_messages_read(uuid,uuid)'::regprocedure,'public.soe_book_salon_messages_post(uuid,uuid,text,text)'::regprocedure)
    AND a.grantee<>p.proowner AND NOT(a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)) THEN
  RAISE EXCEPTION 'Unexpected salon function authority requires review';
 END IF;
END $access$;
COMMIT;
