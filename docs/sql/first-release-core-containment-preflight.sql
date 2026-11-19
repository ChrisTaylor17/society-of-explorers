-- UNAPPLIED REVIEW DRAFT. Catalog/receipt metadata only; never reads user rows.
-- Scope is exactly seven private core tables. Existing policies remain untouched.
BEGIN READ ONLY;
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
DO $containment$
DECLARE
 targets text[] := ARRAY['members','reading_progress','book_highlights','great_books_progress','great_books_highlights','book_reflections','thinker_memory']::text[];
 table_name text; table_oid oid; receipt_oid oid; owner_oid oid; state jsonb; prior jsonb; entry jsonb; col jsonb;
 grantee_sql text; grant_option text; role_name text; applied boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls))
 OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated'))<>2
 OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('anon','authenticated'))
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Core containment role configuration requires review.';
 END IF;
 FOREACH table_name IN ARRAY targets LOOP
  table_oid:=to_regclass(format('public.%I',table_name));
  IF table_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=table_oid AND relkind='r' AND NOT relispartition AND pg_get_userbyid(relowner)=current_user)
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=table_oid AND attname='id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped)
   OR (table_name<>'members' AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=table_oid AND attname='member_id' AND atttypid='uuid'::regtype AND NOT attisdropped))
   OR (table_name='members' AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=table_oid AND attname='supabase_auth_id' AND atttypid='uuid'::regtype AND NOT attnotnull AND NOT attisdropped)) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Core containment ownership or schema requires review.';
  END IF;
  IF NOT has_table_privilege('service_role',table_oid,'SELECT') OR NOT has_table_privilege('service_role',table_oid,'INSERT')
   OR NOT has_table_privilege('service_role',table_oid,'UPDATE') OR NOT has_table_privilege('service_role',table_oid,'DELETE') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Core containment must preserve existing service access.';
  END IF;
  SELECT relowner INTO owner_oid FROM pg_class WHERE oid=table_oid;
  IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid=table_oid AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))) AND a.grantor<>owner_oid)
   OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a
    WHERE c.attrelid=table_oid AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))) AND a.grantor<>owner_oid) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Core containment delegated grantors require review.';
  END IF;
 END LOOP;
 receipt_oid:=to_regclass('public.soe_core_containment_v1_state');
 applied:=receipt_oid IS NOT NULL;
 IF applied THEN
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=receipt_oid AND c.relkind='r' AND NOT c.relispartition AND c.relrowsecurity AND NOT c.relforcerowsecurity AND pg_get_userbyid(c.relowner)=current_user
    AND obj_description(c.oid,'pg_class')='soe-core-containment:v1:owned')
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=receipt_oid)
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped)<>4
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=receipt_oid AND attname='target_table' AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped)
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=receipt_oid AND attname='prior_state' AND atttypid='jsonb'::regtype AND attnotnull AND NOT attisdropped)
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=receipt_oid AND attname='post_state' AND atttypid='jsonb'::regtype AND attnotnull AND NOT attisdropped)
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=receipt_oid AND attname='integrity_digest' AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped)
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=receipt_oid AND a.grantee<>c.relowner)
   OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a JOIN pg_class t ON t.oid=c.attrelid WHERE c.attrelid=receipt_oid AND a.grantee<>t.relowner) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Core containment receipt collision requires review.';
  END IF;
  IF (SELECT count(*) FROM public.soe_core_containment_v1_state)<>cardinality(targets)
   OR EXISTS(SELECT 1 FROM public.soe_core_containment_v1_state s WHERE NOT(s.target_table=ANY(targets)) OR jsonb_typeof(s.prior_state)<>'object' OR jsonb_typeof(s.post_state)<>'object'
     OR s.integrity_digest IS DISTINCT FROM md5(s.target_table||E'\\n'||s.prior_state::text||E'\\n'||s.post_state::text||E'\\nsoe-core-containment:v1')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Core containment receipt shape requires review.';
  END IF;
  FOREACH table_name IN ARRAY targets LOOP
   table_oid:=to_regclass(format('public.%I',table_name));
   SELECT jsonb_build_object(
 'oid',c.oid::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb),
 'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('number',att.attnum,'name',att.attname,'type',format_type(att.atttypid,att.atttypmod),'not_null',att.attnotnull,'identity',att.attidentity,'generated',att.attgenerated,'collation',att.attcollation::text,'default',pg_get_expr((SELECT d.adbin FROM pg_attrdef d WHERE d.adrelid=att.attrelid AND d.adnum=att.attnum),att.attrelid),'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(att.attacl) a),'[]'::jsonb)) ORDER BY att.attnum) FROM pg_attribute att WHERE att.attrelid=c.oid AND att.attnum>0 AND NOT att.attisdropped),'[]'::jsonb),
 'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',p.oid::text,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb),
 'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',k.oid::text,'name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
 'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',i.indexrelid::text,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'[]'::jsonb),
 'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',t.oid::text,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb)
 ) INTO state FROM pg_class c WHERE c.oid=table_oid;
   IF state IS DISTINCT FROM (SELECT s.post_state FROM public.soe_core_containment_v1_state s WHERE s.target_table=table_name) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Core containment state changed; reviewed forward reconciliation is required.';
   END IF;
  END LOOP;
 END IF;

END
$containment$;
SELECT 'core_containment_preflight_passed' AS result;
COMMIT;
