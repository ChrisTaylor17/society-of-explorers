-- UNAPPLIED LOCAL REVIEW DRAFT. No production application authorized.
-- Requires contained raw members access; never publishes legacy rows.
-- Reverse only unused, private revision-zero installation; refuses publication or edits.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
DO $profile$
DECLARE role_name text; installed boolean; proc_oid oid; grant_row record;
BEGIN
 LOCK TABLE public.members IN ACCESS EXCLUSIVE MODE;

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
  IF (SELECT count(*) FROM pg_proc p WHERE p.oid IN(to_regprocedure('public.soe_member_profile_revision_guard()'),to_regprocedure('public.soe_member_profile_update(uuid,bigint,jsonb)')) AND NOT p.prosecdef AND p.provolatile='v' AND p.prokind='f' AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargmodes IS NULL AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AND ((p.proname='soe_member_profile_revision_guard' AND p.prorettype='trigger'::regtype AND p.pronargs=0 AND p.proargnames IS NULL) OR (p.proname='soe_member_profile_update' AND p.prorettype='jsonb'::regtype AND p.pronargs=3 AND p.proargnames=ARRAY['p_actor','p_expected_revision','p_patch']::text[])) AND pg_get_userbyid(p.proowner)=current_user AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AND obj_description(p.oid,'pg_proc')='soe-member-profile:v1:owned'
    AND ((p.proname='soe_member_profile_revision_guard' AND md5(p.prosrc)='f1d9aca39d28330de9d68fa52d9ba7c0') OR (p.proname='soe_member_profile_update' AND md5(p.prosrc)='fa49a35efe43d6ac94c70020deefab43')))<>2 THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile function definition requires review.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN(to_regprocedure('public.soe_member_profile_revision_guard()'),to_regprocedure('public.soe_member_profile_update(uuid,bigint,jsonb)')) AND a.grantee<>p.proowner
    AND NOT(p.proname='soe_member_profile_update' AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
   OR NOT has_function_privilege('service_role','public.soe_member_profile_update(uuid,bigint,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile function grants require review.';
  END IF;
 END IF;

 IF NOT installed THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.members WHERE profile_visibility IS DISTINCT FROM 'private' OR profile_revision IS DISTINCT FROM 0) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Profile choices or edits exist; use a reviewed data-preserving forward plan.';
 END IF;
 DROP TRIGGER soe_member_profile_revision_guard ON public.members;
 DROP FUNCTION public.soe_member_profile_update(uuid,bigint,jsonb);
 DROP FUNCTION public.soe_member_profile_revision_guard();
 ALTER TABLE public.members DROP COLUMN profile_visibility, DROP COLUMN profile_revision;
END
$profile$;
SELECT 'member_profile_unused_rollback_completed_or_absent' AS result;
COMMIT;
