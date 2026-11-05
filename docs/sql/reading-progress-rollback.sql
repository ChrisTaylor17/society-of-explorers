-- UNAPPLIED LOCAL REVIEW DRAFT. No production execution authorized.
-- Requires great-books-private-data.sql containment and existing canonical members.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
DO $progress$
DECLARE role_name text; installed boolean; proc_oid oid; grant_row record;
BEGIN
 LOCK TABLE public.reading_progress IN ACCESS EXCLUSIVE MODE;

 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.reading_progress') AND relkind='r' AND NOT relispartition AND relrowsecurity AND pg_get_userbyid(relowner)=current_user)
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.members') AND attname='id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped)
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated','service_role'))<>3
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls))
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper)
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated','service_role')) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved reading ownership or role configuration requires review.';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.reading_progress'::regclass)
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.reading_progress'::regclass AND NOT tgisinternal)
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='public.reading_progress'::regclass) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved reading policies or triggers require review.';
 END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(role_name,'public.reading_progress','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege(role_name,'public.reading_progress','SELECT,INSERT,UPDATE,REFERENCES') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Contain raw saved reading browser access first.';
  END IF;
 END LOOP;
 IF NOT has_table_privilege('service_role','public.reading_progress','SELECT')
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.reading_progress'::regclass AND NOT attisdropped AND attacl IS NOT NULL)
  OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid='public.reading_progress'::regclass AND a.grantee<>c.relowner
    AND NOT(a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND a.privilege_type IN('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN') AND NOT a.is_grantable)) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved reading grants require review.';
 END IF;
 IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.reading_progress'::regclass AND NOT attisdropped AND
  ((attname IN('id','member_id') AND atttypid='uuid'::regtype AND attnotnull) OR (attname='book_id' AND atttypid='text'::regtype AND attnotnull)
   OR (attname='section_id' AND atttypid='text'::regtype) OR (attname='paragraph_index' AND atttypid='integer'::regtype)
   OR (attname='completed' AND atttypid='boolean'::regtype) OR (attname='updated_at' AND atttypid='timestamptz'::regtype)))<>7
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.reading_progress'::regclass AND contype='u' AND NOT condeferrable AND convalidated
   AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.reading_progress'::regclass AND attname='member_id'),(SELECT attnum FROM pg_attribute WHERE attrelid='public.reading_progress'::regclass AND attname='book_id')]::smallint[]) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved reading table shape requires review.';
 END IF;
 installed:=EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.reading_progress'::regclass AND attname IN('progress_revision','progress_removed') AND NOT attisdropped);
 IF installed THEN
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.reading_progress'::regclass AND attname='progress_revision' AND atttypid='bigint'::regtype AND attnotnull AND NOT attisdropped AND attidentity='' AND attgenerated='' AND col_description(attrelid,attnum)='soe-reading-progress:v1:revision' AND (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d WHERE d.adrelid=attrelid AND d.adnum=attnum)='0')
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.reading_progress'::regclass AND attname='progress_removed' AND atttypid='boolean'::regtype AND attnotnull AND NOT attisdropped AND attidentity='' AND attgenerated='' AND col_description(attrelid,attnum)='soe-reading-progress:v1:removed' AND (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d WHERE d.adrelid=attrelid AND d.adnum=attnum)='false')
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.reading_progress'::regclass AND conname='soe_reading_progress_revision_check' AND contype='c' AND convalidated AND NOT connoinherit AND pg_get_constraintdef(oid)=$definition$CHECK (((progress_revision >= 0) AND (progress_revision <= '9007199254740991'::bigint)))$definition$)
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.reading_progress'::regclass AND conname='soe_reading_progress_removed_check' AND contype='c' AND convalidated AND NOT connoinherit AND pg_get_constraintdef(oid)=$definition$CHECK (((NOT progress_removed) OR ((progress_revision > 0) AND (section_id IS NULL) AND (paragraph_index IS NULL) AND (completed IS NULL) AND (updated_at IS NOT NULL))))$definition$)
   OR has_table_privilege('service_role','public.reading_progress','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid='public.reading_progress'::regclass AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND a.privilege_type<>'SELECT') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved reading revision schema or write barrier has drifted.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.reading_progress'::regclass AND c.conname NOT IN('soe_reading_progress_revision_check','soe_reading_progress_removed_check')
    AND c.conkey && ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid='public.reading_progress'::regclass AND attname IN('progress_revision','progress_removed') AND NOT attisdropped)::smallint[])
   OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=i.indexrelid AND d.refclassid='pg_class'::regclass AND d.refobjid=i.indrelid
    WHERE i.indrelid='public.reading_progress'::regclass AND d.refobjsubid IN(SELECT attnum FROM pg_attribute WHERE attrelid='public.reading_progress'::regclass AND attname IN('progress_revision','progress_removed') AND NOT attisdropped)) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Later saved reading dependencies require review.';
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='soe_reading_progress_update') THEN
  proc_oid:=to_regprocedure('public.soe_reading_progress_update(uuid,bigint,text,text,text,bigint,boolean)');
  IF NOT installed OR proc_oid IS NULL OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='soe_reading_progress_update')<>1
   OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=proc_oid AND p.prosecdef AND p.provolatile='v' AND p.prokind='f' AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel='u' AND p.provariadic=0 AND p.pronargdefaults=0 AND p.proargmodes IS NULL AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AND p.prorettype='jsonb'::regtype AND p.pronargs=7 AND p.proargnames=ARRAY['p_actor','p_expected_revision','p_book_id','p_action','p_edition_id','p_block_index','p_completed']::text[] AND pg_get_userbyid(p.proowner)=current_user AND p.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AND obj_description(p.oid,'pg_proc')='soe-reading-progress:v1:owned' AND md5(p.prosrc)='9e43b577e6516c223ad8ab83cd917d9c')
   OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=proc_oid AND a.grantee<>p.proowner AND NOT(a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
   OR NOT has_function_privilege('service_role',proc_oid,'EXECUTE') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved reading function or grants require review.';
  END IF;
 END IF;

 IF NOT installed THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved reading revision migration is not installed.'; END IF;
 IF proc_oid IS NOT NULL THEN EXECUTE 'DROP FUNCTION public.soe_reading_progress_update(uuid,bigint,text,text,text,bigint,boolean)'; END IF;
 -- Intentionally retain revision columns, constraints, cleared tombstones and
 -- the direct-write privilege barrier. Restoring raw upsert is not a safe rollback.
END
$progress$;
SELECT 'reading_progress_rpc_disabled_data_and_write_barrier_retained' AS result;
COMMIT;
