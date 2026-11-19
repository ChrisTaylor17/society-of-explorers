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

 IF NOT installed THEN
  ALTER TABLE public.reading_progress ADD COLUMN progress_revision bigint NOT NULL DEFAULT 0 CONSTRAINT soe_reading_progress_revision_check CHECK(progress_revision BETWEEN 0 AND 9007199254740991);
  ALTER TABLE public.reading_progress ADD COLUMN progress_removed boolean NOT NULL DEFAULT false CONSTRAINT soe_reading_progress_removed_check CHECK(NOT progress_removed OR (progress_revision>0 AND section_id IS NULL AND paragraph_index IS NULL AND completed IS NULL AND updated_at IS NOT NULL));
  COMMENT ON COLUMN public.reading_progress.progress_revision IS 'soe-reading-progress:v1:revision';
  COMMENT ON COLUMN public.reading_progress.progress_removed IS 'soe-reading-progress:v1:removed';
 END IF;
 -- Old servers used a direct upsert. Revoking raw writes is the rollout barrier,
 -- including DELETE/TRUNCATE which would erase the revision tombstones.
 REVOKE ALL PRIVILEGES ON public.reading_progress FROM service_role;
 GRANT SELECT ON public.reading_progress TO service_role;
 IF to_regprocedure('public.soe_reading_progress_update(uuid,bigint,text,text,text,bigint,boolean)') IS NOT NULL THEN RETURN; END IF;
 EXECUTE $ddl$CREATE FUNCTION public.soe_reading_progress_update(p_actor uuid,p_expected_revision bigint,p_book_id text,p_action text,p_edition_id text,p_block_index bigint,p_completed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $update$
DECLARE before_row public.reading_progress; saved public.reading_progress; locator text; changed boolean;
BEGIN
 IF p_actor IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991
  OR p_book_id IS NULL OR p_book_id NOT IN('republic','meditations','genealogy-of-morals','apology','odyssey','divine-comedy','hamlet','relativity')
  OR p_action IS NULL OR p_action NOT IN('save','remove') THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid saved reading action.';
 END IF;
 IF p_action='save' THEN
  IF p_edition_id IS NULL OR p_edition_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
   OR p_block_index IS NULL OR p_block_index NOT BETWEEN 0 AND 99999 OR p_completed IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid saved reading location.';
  END IF;
  locator:='soe-reading:v1:'||p_edition_id||':'||p_block_index::text;
 ELSIF p_edition_id IS NOT NULL OR p_block_index IS NOT NULL OR p_completed IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Remove does not accept a reading location.';
 END IF;
 PERFORM 1 FROM public.members WHERE id=p_actor FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved reading account is unavailable.'; END IF;
 -- The uncommitted placeholder is never returned. ON CONFLICT waits for an
 -- earlier first writer; the subsequent row lock observes its committed revision.
 INSERT INTO public.reading_progress(member_id,book_id,section_id,paragraph_index,completed,updated_at,progress_revision,progress_removed)
  VALUES(p_actor,p_book_id,NULL,NULL,NULL,NULL,0,false) ON CONFLICT(member_id,book_id) DO NOTHING;
 SELECT * INTO before_row FROM public.reading_progress WHERE member_id=p_actor AND book_id=p_book_id FOR UPDATE;
 IF NOT FOUND OR before_row.progress_revision<>p_expected_revision THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved reading changed. Load current state before reviewing another action.';
 END IF;
 changed:=CASE WHEN p_action='remove' THEN NOT before_row.progress_removed ELSE
  ROW(before_row.progress_removed,before_row.section_id,before_row.paragraph_index,before_row.completed)
   IS DISTINCT FROM ROW(false,locator,0,p_completed) END;
 IF changed THEN
  IF before_row.progress_revision>=9007199254740991 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved reading revision requires review.'; END IF;
  UPDATE public.reading_progress SET section_id=CASE WHEN p_action='save' THEN locator ELSE NULL END,
   paragraph_index=CASE WHEN p_action='save' THEN 0 ELSE NULL END,
   completed=CASE WHEN p_action='save' THEN p_completed ELSE NULL END,
   progress_removed=(p_action='remove'),progress_revision=before_row.progress_revision+1,updated_at=clock_timestamp()
   WHERE member_id=p_actor AND book_id=p_book_id RETURNING * INTO saved;
 ELSE saved:=before_row;
 END IF;
 RETURN jsonb_build_object('member_id',saved.member_id,'book_id',saved.book_id,'section_id',saved.section_id,
  'paragraph_index',saved.paragraph_index,'completed',saved.completed,'updated_at',saved.updated_at,
  'progress_revision',saved.progress_revision,'progress_removed',saved.progress_removed);
END
$update$;$ddl$;
 proc_oid:='public.soe_reading_progress_update(uuid,bigint,text,text,text,bigint,boolean)'::regprocedure;
 COMMENT ON FUNCTION public.soe_reading_progress_update(uuid,bigint,text,text,text,bigint,boolean) IS 'soe-reading-progress:v1:owned';
 FOR grant_row IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=proc_oid AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s',proc_oid::regprocedure,CASE WHEN grant_row.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grant_row.grantee)) END);
 END LOOP;
 GRANT EXECUTE ON FUNCTION public.soe_reading_progress_update(uuid,bigint,text,text,text,bigint,boolean) TO service_role;
END
$progress$;
SELECT 'reading_progress_applied_locally_or_already_current' AS result;
COMMIT;
