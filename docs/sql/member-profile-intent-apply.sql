-- UNAPPLIED LOCAL REVIEW CANDIDATE. Run only in an authorized isolated restore.
-- Requires member-profile v1; preserves all choices and monotonic revision history.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
LOCK TABLE public.members IN ACCESS EXCLUSIVE MODE;
DO $profile$
DECLARE role_name text; installed boolean; proc_oid oid; grant_row record; intent boolean;
BEGIN

 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.members') AND relkind='r' AND NOT relispartition AND relrowsecurity AND pg_get_userbyid(relowner)=current_user)
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls))
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated'))
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile ownership or role configuration requires review.';
 END IF;
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN('anon','authenticated') LOOP
  IF has_table_privilege(role_name,'public.members','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege(role_name,'public.members','SELECT,INSERT,UPDATE,REFERENCES') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Raw member browser access must be contained first.';
  END IF;
 END LOOP;
 IF NOT has_table_privilege('service_role','public.members','SELECT') OR NOT has_table_privilege('service_role','public.members','INSERT')
  OR NOT has_table_privilege('service_role','public.members','UPDATE') OR NOT has_table_privilege('service_role','public.members','DELETE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Existing profile service access is required.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped)
  OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname IN('display_name','bio','discipline','project_description','seeking','philosophy') AND atttypid='text'::regtype AND NOT attisdropped)<>6
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='skills' AND atttypid='text[]'::regtype AND NOT attisdropped) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile field schema requires review.';
 END IF;
 installed:=EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname IN('profile_visibility','profile_revision') AND NOT attisdropped)
  OR to_regprocedure('public.soe_member_profile_revision_guard()') IS NOT NULL OR to_regprocedure('public.soe_member_profile_update(uuid,bigint,jsonb)') IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.members'::regclass AND tgname='soe_member_profile_revision_guard');
  IF NOT installed THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Install the reviewed owner-profile migration first.'; END IF;
  intent:=to_regprocedure('public.soe_member_profile_write_intent_guard()') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.members'::regclass AND tgname='soe_member_profile_write_intent_guard');
  IF installed THEN
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='profile_visibility' AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped AND col_description(attrelid,attnum)='soe-member-profile:v1:visibility' AND attidentity='' AND attgenerated='' AND (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d WHERE d.adrelid=attrelid AND d.adnum=attnum)=$default$'private'::text$default$)
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='profile_revision' AND atttypid='bigint'::regtype AND attnotnull AND NOT attisdropped AND col_description(attrelid,attnum)='soe-member-profile:v1:revision' AND attidentity='' AND attgenerated='' AND (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d WHERE d.adrelid=attrelid AND d.adnum=attnum)='0')
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.members'::regclass AND conname='soe_member_profile_visibility_check' AND contype='c' AND convalidated AND NOT connoinherit AND pg_get_constraintdef(oid)=$definition$CHECK ((profile_visibility = ANY (ARRAY['private'::text, 'public'::text])))$definition$)
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.members'::regclass AND conname='soe_member_profile_revision_check' AND contype='c' AND convalidated AND NOT connoinherit AND pg_get_constraintdef(oid)=$definition$CHECK (((profile_revision >= 0) AND (profile_revision <= '9007199254740991'::bigint)))$definition$)
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.members'::regclass AND tgname='soe_member_profile_revision_guard' AND tgfoid=to_regprocedure('public.soe_member_profile_revision_guard()') AND tgenabled='O' AND tgtype=23 AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0 AND octet_length(tgargs)=0 AND NOT tgisinternal AND NOT tgdeferrable AND NOT tginitdeferred AND tgconstraint=0 AND tgconstrrelid=0 AND tgconstrindid=0 AND tgparentid=0 AND obj_description(oid,'pg_trigger')='soe-member-profile:v1:guard') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile migration object collision or drift requires review.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.members'::regclass AND c.conname NOT IN('soe_member_profile_visibility_check','soe_member_profile_revision_check')
    AND c.conkey && ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname IN('profile_visibility','profile_revision') AND NOT attisdropped)::smallint[])
   OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=i.indexrelid AND d.refclassid='pg_class'::regclass AND d.refobjid=i.indrelid
    WHERE i.indrelid='public.members'::regclass AND d.refobjsubid IN(SELECT attnum FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname IN('profile_visibility','profile_revision') AND NOT attisdropped)) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Later profile column dependencies require a data-preserving review.';
  END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.oid IN(to_regprocedure('public.soe_member_profile_revision_guard()'),to_regprocedure('public.soe_member_profile_update(uuid,bigint,jsonb)')) AND NOT p.prosecdef AND p.provolatile='v' AND p.prokind='f' AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargmodes IS NULL AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AND ((p.proname='soe_member_profile_revision_guard' AND p.prorettype='trigger'::regtype AND p.pronargs=0 AND p.proargnames IS NULL) OR (p.proname='soe_member_profile_update' AND p.prorettype='jsonb'::regtype AND p.pronargs=3 AND p.proargnames=ARRAY['p_actor','p_expected_revision','p_patch']::text[])) AND pg_get_userbyid(p.proowner)=current_user AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AND obj_description(p.oid,'pg_proc')=CASE WHEN p.proname='soe_member_profile_update' AND intent THEN 'soe-member-profile-intent:v1:owned' ELSE 'soe-member-profile:v1:owned' END
    AND ((p.proname='soe_member_profile_revision_guard' AND md5(p.prosrc)='f1d9aca39d28330de9d68fa52d9ba7c0') OR (p.proname='soe_member_profile_update' AND md5(p.prosrc)=CASE WHEN intent THEN 'cc739c291959fdd0fd121e0d5abcba95' ELSE 'fa49a35efe43d6ac94c70020deefab43' END)))<>2 THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile function definition requires review.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN(to_regprocedure('public.soe_member_profile_revision_guard()'),to_regprocedure('public.soe_member_profile_update(uuid,bigint,jsonb)')) AND a.grantee<>p.proowner
    AND NOT(p.proname='soe_member_profile_update' AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
   OR (NOT intent AND NOT has_function_privilege('service_role','public.soe_member_profile_update(uuid,bigint,jsonb)','EXECUTE')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile function grants require review.';
  END IF;
 END IF;

  IF EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.members'::regclass AND NOT t.tgisinternal AND (t.tgtype&19)=19
    AND t.tgname NOT IN('soe_member_profile_revision_guard','soe_member_profile_write_intent_guard')
    AND (t.tgattr::text='' OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=t.tgrelid AND a.attnum=ANY(t.tgattr::smallint[]) AND a.attname=ANY(ARRAY['display_name','bio','discipline','skills','project_description','seeking','philosophy','profile_visibility']::text[] || ARRAY['profile_revision'])))) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Other profile BEFORE triggers require an ordering review.';
  END IF;
  IF intent THEN
   IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.members'::regclass AND tgname='soe_member_profile_write_intent_guard' AND tgfoid=to_regprocedure('public.soe_member_profile_write_intent_guard()') AND tgenabled='O' AND tgtype=19 AND tgqual IS NULL AND tgattr::text=(SELECT string_agg(attnum::text,' ' ORDER BY array_position(ARRAY['display_name','bio','discipline','skills','project_description','seeking','philosophy','profile_visibility']::text[],attname::text)) FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname=ANY(ARRAY['display_name','bio','discipline','skills','project_description','seeking','philosophy','profile_visibility']::text[]) AND NOT attisdropped) AND tgnargs=0 AND octet_length(tgargs)=0 AND NOT tgisinternal AND NOT tgdeferrable AND NOT tginitdeferred AND tgconstraint=0 AND tgconstrrelid=0 AND tgconstrindid=0 AND tgparentid=0 AND obj_description(oid,'pg_trigger')='soe-member-profile-intent:v1:guard')
    OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.soe_member_profile_write_intent_guard()') AND NOT p.prosecdef AND p.provolatile='v' AND p.prokind='f' AND p.prorettype='trigger'::regtype AND p.pronargs=0 AND p.proargnames IS NULL AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargmodes IS NULL AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AND pg_get_userbyid(p.proowner)=current_user AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AND obj_description(p.oid,'pg_proc')='soe-member-profile-intent:v1:owned' AND md5(p.prosrc)='155f406b906db822db6babdb0861b74f')
    OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('public.soe_member_profile_write_intent_guard()') AND a.grantee<>p.proowner) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile intent trigger definition or grants require review.';
   END IF;
  END IF;
END
$profile$;
DO $install$
DECLARE grant_row record;
BEGIN
 IF to_regprocedure('public.soe_member_profile_write_intent_guard()') IS NULL THEN
  EXECUTE $ddl$CREATE FUNCTION public.soe_member_profile_write_intent_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$
BEGIN
 -- The original revision guard runs first alphabetically and still rejects all
 -- caller-written revisions. A real authored change may already have advanced.
 IF NEW.profile_revision IS DISTINCT FROM OLD.profile_revision AND NEW.profile_revision IS DISTINCT FROM OLD.profile_revision+1 THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Profile revision is server managed.';
 END IF;
 IF OLD.profile_revision>=9007199254740991 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile revision requires review.'; END IF;
 NEW.profile_revision:=OLD.profile_revision+1;
 RETURN NEW;
END
$body$$ddl$;
  EXECUTE 'CREATE TRIGGER soe_member_profile_write_intent_guard BEFORE UPDATE OF display_name,bio,discipline,skills,project_description,seeking,philosophy,profile_visibility ON public.members FOR EACH ROW EXECUTE FUNCTION public.soe_member_profile_write_intent_guard()';
  COMMENT ON FUNCTION public.soe_member_profile_write_intent_guard() IS 'soe-member-profile-intent:v1:owned';
  COMMENT ON TRIGGER soe_member_profile_write_intent_guard ON public.members IS 'soe-member-profile-intent:v1:guard';
  FOR grant_row IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.soe_member_profile_write_intent_guard()'::regprocedure AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION public.soe_member_profile_write_intent_guard() FROM %s',CASE WHEN grant_row.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grant_row.grantee)) END);
  END LOOP;
  EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.soe_member_profile_update(p_actor uuid,p_expected_revision bigint,p_patch jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $update$
DECLARE m public.members; saved public.members; item record; value jsonb; plain text; maximum integer; units integer; i integer; changed boolean;
BEGIN
 IF p_actor IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991
  OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR octet_length(p_patch::text)>65536
  OR p_patch='{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid profile update.'; END IF;
 FOR item IN SELECT j.key,j.value FROM jsonb_each(p_patch) j LOOP
  IF item.key NOT IN('displayName','bio','discipline','skills','projectDescription','seeking','philosophy','visibility') THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid profile field.';
  END IF;
  IF item.key='skills' THEN
   IF jsonb_typeof(item.value)<>'array' OR jsonb_array_length(item.value)>40 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid profile skills.'; END IF;
   FOR value IN SELECT jsonb_array_elements(item.value) LOOP
    IF jsonb_typeof(value)<>'string' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid profile skills.'; END IF;
    plain:=btrim(value#>>'{}'); units:=0;
    IF length(plain)=0 OR plain ~ '[[:cntrl:]]' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid profile skills.'; END IF;
    FOR i IN 1..char_length(plain) LOOP units:=units+CASE WHEN ascii(substr(plain,i,1))>65535 THEN 2 ELSE 1 END; END LOOP;
    IF units>100 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid profile skills.'; END IF;
   END LOOP;
  ELSE
   IF jsonb_typeof(item.value)<>'string' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid profile text.'; END IF;
   plain:=btrim(item.value#>>'{}');
   IF item.key='visibility' THEN
    IF plain NOT IN('private','public') OR plain IS DISTINCT FROM item.value#>>'{}' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid profile visibility.'; END IF;
   ELSE
    maximum:=CASE item.key WHEN 'displayName' THEN 200 WHEN 'discipline' THEN 100 WHEN 'seeking' THEN 1000 ELSE 2000 END;
    units:=0; FOR i IN 1..char_length(plain) LOOP units:=units+CASE WHEN ascii(substr(plain,i,1))>65535 THEN 2 ELSE 1 END; END LOOP;
    IF units>maximum OR (item.key='displayName' AND length(plain)=0)
     OR (item.key IN('displayName','discipline') AND plain ~ '[[:cntrl:]]')
     OR regexp_replace(plain,E'[\t\n\r]','','g') ~ '[[:cntrl:]]' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid profile text.'; END IF;
   END IF;
  END IF;
 END LOOP;
 SELECT * INTO m FROM public.members WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND OR m.profile_revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile changed. Reload before saving.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.members'::regclass AND tgname='soe_member_profile_revision_guard'
   AND tgfoid='public.soe_member_profile_revision_guard()'::regprocedure AND tgenabled='O' AND tgtype=23 AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0 AND octet_length(tgargs)=0 AND NOT tgisinternal AND NOT tgdeferrable AND NOT tginitdeferred AND tgconstraint=0 AND tgconstrrelid=0 AND tgconstrindid=0 AND tgparentid=0) THEN
  RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Profile revision protection is unavailable.';
 END IF;
 UPDATE public.members SET
  display_name=CASE WHEN p_patch?'displayName' THEN btrim(p_patch->>'displayName') ELSE display_name END,
  bio=CASE WHEN p_patch?'bio' THEN btrim(p_patch->>'bio') ELSE bio END,
  discipline=CASE WHEN p_patch?'discipline' THEN btrim(p_patch->>'discipline') ELSE discipline END,
  skills=CASE WHEN p_patch?'skills' THEN ARRAY(SELECT btrim(x.entry#>>'{}') FROM jsonb_array_elements(p_patch->'skills') x(entry)) ELSE skills END,
  project_description=CASE WHEN p_patch?'projectDescription' THEN btrim(p_patch->>'projectDescription') ELSE project_description END,
  seeking=CASE WHEN p_patch?'seeking' THEN btrim(p_patch->>'seeking') ELSE seeking END,
  philosophy=CASE WHEN p_patch?'philosophy' THEN btrim(p_patch->>'philosophy') ELSE philosophy END,
  profile_visibility=CASE WHEN p_patch?'visibility' THEN p_patch->>'visibility' ELSE profile_visibility END
 WHERE id=p_actor RETURNING * INTO saved;
 changed:=ROW(saved.display_name,saved.bio,saved.discipline,saved.skills,saved.project_description,saved.seeking,saved.philosophy,saved.profile_visibility)
   IS DISTINCT FROM ROW(m.display_name,m.bio,m.discipline,m.skills,m.project_description,m.seeking,m.philosophy,m.profile_visibility);
 IF saved.profile_revision IS DISTINCT FROM p_expected_revision+1 THEN
  RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Profile revision protection is unavailable.';
 END IF;
 RETURN jsonb_build_object('id',saved.id,'profile_revision',saved.profile_revision,'profile_visibility',saved.profile_visibility,
  'display_name',saved.display_name,'bio',saved.bio,'discipline',saved.discipline,'skills',saved.skills,
  'project_description',saved.project_description,'seeking',saved.seeking,'philosophy',saved.philosophy);
END
$update$$ddl$;
  COMMENT ON FUNCTION public.soe_member_profile_update(uuid,bigint,jsonb) IS 'soe-member-profile-intent:v1:owned';
 END IF;
 REVOKE ALL ON FUNCTION public.soe_member_profile_update(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.soe_member_profile_update(uuid,bigint,jsonb) TO service_role;
END
$install$;
DO $profile$
DECLARE role_name text; installed boolean; proc_oid oid; grant_row record; intent boolean;
BEGIN

 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.members') AND relkind='r' AND NOT relispartition AND relrowsecurity AND pg_get_userbyid(relowner)=current_user)
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls))
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated'))
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile ownership or role configuration requires review.';
 END IF;
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN('anon','authenticated') LOOP
  IF has_table_privilege(role_name,'public.members','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege(role_name,'public.members','SELECT,INSERT,UPDATE,REFERENCES') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Raw member browser access must be contained first.';
  END IF;
 END LOOP;
 IF NOT has_table_privilege('service_role','public.members','SELECT') OR NOT has_table_privilege('service_role','public.members','INSERT')
  OR NOT has_table_privilege('service_role','public.members','UPDATE') OR NOT has_table_privilege('service_role','public.members','DELETE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Existing profile service access is required.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped)
  OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname IN('display_name','bio','discipline','project_description','seeking','philosophy') AND atttypid='text'::regtype AND NOT attisdropped)<>6
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='skills' AND atttypid='text[]'::regtype AND NOT attisdropped) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile field schema requires review.';
 END IF;
 installed:=EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname IN('profile_visibility','profile_revision') AND NOT attisdropped)
  OR to_regprocedure('public.soe_member_profile_revision_guard()') IS NOT NULL OR to_regprocedure('public.soe_member_profile_update(uuid,bigint,jsonb)') IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.members'::regclass AND tgname='soe_member_profile_revision_guard');
  IF NOT installed THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Install the reviewed owner-profile migration first.'; END IF;
  intent:=to_regprocedure('public.soe_member_profile_write_intent_guard()') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.members'::regclass AND tgname='soe_member_profile_write_intent_guard');
  IF installed THEN
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='profile_visibility' AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped AND col_description(attrelid,attnum)='soe-member-profile:v1:visibility' AND attidentity='' AND attgenerated='' AND (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d WHERE d.adrelid=attrelid AND d.adnum=attnum)=$default$'private'::text$default$)
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='profile_revision' AND atttypid='bigint'::regtype AND attnotnull AND NOT attisdropped AND col_description(attrelid,attnum)='soe-member-profile:v1:revision' AND attidentity='' AND attgenerated='' AND (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d WHERE d.adrelid=attrelid AND d.adnum=attnum)='0')
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.members'::regclass AND conname='soe_member_profile_visibility_check' AND contype='c' AND convalidated AND NOT connoinherit AND pg_get_constraintdef(oid)=$definition$CHECK ((profile_visibility = ANY (ARRAY['private'::text, 'public'::text])))$definition$)
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.members'::regclass AND conname='soe_member_profile_revision_check' AND contype='c' AND convalidated AND NOT connoinherit AND pg_get_constraintdef(oid)=$definition$CHECK (((profile_revision >= 0) AND (profile_revision <= '9007199254740991'::bigint)))$definition$)
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.members'::regclass AND tgname='soe_member_profile_revision_guard' AND tgfoid=to_regprocedure('public.soe_member_profile_revision_guard()') AND tgenabled='O' AND tgtype=23 AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0 AND octet_length(tgargs)=0 AND NOT tgisinternal AND NOT tgdeferrable AND NOT tginitdeferred AND tgconstraint=0 AND tgconstrrelid=0 AND tgconstrindid=0 AND tgparentid=0 AND obj_description(oid,'pg_trigger')='soe-member-profile:v1:guard') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile migration object collision or drift requires review.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.members'::regclass AND c.conname NOT IN('soe_member_profile_visibility_check','soe_member_profile_revision_check')
    AND c.conkey && ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname IN('profile_visibility','profile_revision') AND NOT attisdropped)::smallint[])
   OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=i.indexrelid AND d.refclassid='pg_class'::regclass AND d.refobjid=i.indrelid
    WHERE i.indrelid='public.members'::regclass AND d.refobjsubid IN(SELECT attnum FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname IN('profile_visibility','profile_revision') AND NOT attisdropped)) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Later profile column dependencies require a data-preserving review.';
  END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.oid IN(to_regprocedure('public.soe_member_profile_revision_guard()'),to_regprocedure('public.soe_member_profile_update(uuid,bigint,jsonb)')) AND NOT p.prosecdef AND p.provolatile='v' AND p.prokind='f' AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargmodes IS NULL AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AND ((p.proname='soe_member_profile_revision_guard' AND p.prorettype='trigger'::regtype AND p.pronargs=0 AND p.proargnames IS NULL) OR (p.proname='soe_member_profile_update' AND p.prorettype='jsonb'::regtype AND p.pronargs=3 AND p.proargnames=ARRAY['p_actor','p_expected_revision','p_patch']::text[])) AND pg_get_userbyid(p.proowner)=current_user AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AND obj_description(p.oid,'pg_proc')=CASE WHEN p.proname='soe_member_profile_update' AND intent THEN 'soe-member-profile-intent:v1:owned' ELSE 'soe-member-profile:v1:owned' END
    AND ((p.proname='soe_member_profile_revision_guard' AND md5(p.prosrc)='f1d9aca39d28330de9d68fa52d9ba7c0') OR (p.proname='soe_member_profile_update' AND md5(p.prosrc)=CASE WHEN intent THEN 'cc739c291959fdd0fd121e0d5abcba95' ELSE 'fa49a35efe43d6ac94c70020deefab43' END)))<>2 THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile function definition requires review.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN(to_regprocedure('public.soe_member_profile_revision_guard()'),to_regprocedure('public.soe_member_profile_update(uuid,bigint,jsonb)')) AND a.grantee<>p.proowner
    AND NOT(p.proname='soe_member_profile_update' AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
   OR (NOT intent AND NOT has_function_privilege('service_role','public.soe_member_profile_update(uuid,bigint,jsonb)','EXECUTE')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile function grants require review.';
  END IF;
 END IF;

  IF EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.members'::regclass AND NOT t.tgisinternal AND (t.tgtype&19)=19
    AND t.tgname NOT IN('soe_member_profile_revision_guard','soe_member_profile_write_intent_guard')
    AND (t.tgattr::text='' OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=t.tgrelid AND a.attnum=ANY(t.tgattr::smallint[]) AND a.attname=ANY(ARRAY['display_name','bio','discipline','skills','project_description','seeking','philosophy','profile_visibility']::text[] || ARRAY['profile_revision'])))) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Other profile BEFORE triggers require an ordering review.';
  END IF;
  IF intent THEN
   IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.members'::regclass AND tgname='soe_member_profile_write_intent_guard' AND tgfoid=to_regprocedure('public.soe_member_profile_write_intent_guard()') AND tgenabled='O' AND tgtype=19 AND tgqual IS NULL AND tgattr::text=(SELECT string_agg(attnum::text,' ' ORDER BY array_position(ARRAY['display_name','bio','discipline','skills','project_description','seeking','philosophy','profile_visibility']::text[],attname::text)) FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname=ANY(ARRAY['display_name','bio','discipline','skills','project_description','seeking','philosophy','profile_visibility']::text[]) AND NOT attisdropped) AND tgnargs=0 AND octet_length(tgargs)=0 AND NOT tgisinternal AND NOT tgdeferrable AND NOT tginitdeferred AND tgconstraint=0 AND tgconstrrelid=0 AND tgconstrindid=0 AND tgparentid=0 AND obj_description(oid,'pg_trigger')='soe-member-profile-intent:v1:guard')
    OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.soe_member_profile_write_intent_guard()') AND NOT p.prosecdef AND p.provolatile='v' AND p.prokind='f' AND p.prorettype='trigger'::regtype AND p.pronargs=0 AND p.proargnames IS NULL AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargmodes IS NULL AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AND pg_get_userbyid(p.proowner)=current_user AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AND obj_description(p.oid,'pg_proc')='soe-member-profile-intent:v1:owned' AND md5(p.prosrc)='155f406b906db822db6babdb0861b74f')
    OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('public.soe_member_profile_write_intent_guard()') AND a.grantee<>p.proowner) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile intent trigger definition or grants require review.';
   END IF;
  END IF;
END
$profile$;
SELECT 'member_profile_intent_apply_verified' AS result;
COMMIT;
