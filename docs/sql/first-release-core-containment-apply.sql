-- UNAPPLIED REVIEW DRAFT. NO production execution is authorized by this file.
-- Deliberately breaks raw browser/Data API access to seven private core tables.
-- Preserves rows, policies, schema, other roles and existing service-role access.
-- Review callers, restore evidence, privilege impact and rollback before approval.
BEGIN;
SET LOCAL lock_timeout='5s';
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

 IF applied THEN RETURN; END IF;
 -- Lock bounded metadata targets before snapshot/revoke; no zero-downtime claim.
 FOREACH table_name IN ARRAY targets LOOP EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',table_name); END LOOP;
 -- Revalidate accepted roles/schema/receipt and all current post-state AFTER locks.
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

 IF applied THEN RETURN; END IF;

 CREATE TABLE public.soe_core_containment_v1_state(target_table text PRIMARY KEY,prior_state jsonb NOT NULL,post_state jsonb NOT NULL,integrity_digest text NOT NULL);
 COMMENT ON TABLE public.soe_core_containment_v1_state IS 'soe-core-containment:v1:owned';
 ALTER TABLE public.soe_core_containment_v1_state ENABLE ROW LEVEL SECURITY;
 -- Remove defaults on this newly owned metadata receipt, including unknown roles.
 FOR role_name IN SELECT DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
  FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
  WHERE c.oid='public.soe_core_containment_v1_state'::regclass AND a.grantee<>c.relowner LOOP
  grantee_sql:=CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END;
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.soe_core_containment_v1_state FROM '||grantee_sql;
 END LOOP;
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
  prior:=state;
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC,anon,authenticated',table_name);
  FOR col IN SELECT jsonb_array_elements(prior->'columns') LOOP
   EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC,anon,authenticated',col->>'name',table_name);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  -- PUBLIC may have supplied a required service privilege. Never silently
  -- broaden grants or commit after removing effective server access.
  IF NOT has_table_privilege('service_role',table_oid,'SELECT') OR NOT has_table_privilege('service_role',table_oid,'INSERT')
   OR NOT has_table_privilege('service_role',table_oid,'UPDATE') OR NOT has_table_privilege('service_role',table_oid,'DELETE') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Core containment would remove effective service access.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND
   (has_table_privilege(r.oid,table_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid,table_oid,'SELECT,INSERT,UPDATE,REFERENCES'))) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Core containment effective grants require review.';
  END IF;
  SELECT jsonb_build_object(
 'oid',c.oid::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb),
 'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('number',att.attnum,'name',att.attname,'type',format_type(att.atttypid,att.atttypmod),'not_null',att.attnotnull,'identity',att.attidentity,'generated',att.attgenerated,'collation',att.attcollation::text,'default',pg_get_expr((SELECT d.adbin FROM pg_attrdef d WHERE d.adrelid=att.attrelid AND d.adnum=att.attnum),att.attrelid),'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(att.attacl) a),'[]'::jsonb)) ORDER BY att.attnum) FROM pg_attribute att WHERE att.attrelid=c.oid AND att.attnum>0 AND NOT att.attisdropped),'[]'::jsonb),
 'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',p.oid::text,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb),
 'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',k.oid::text,'name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
 'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',i.indexrelid::text,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'[]'::jsonb),
 'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',t.oid::text,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb)
 ) INTO state FROM pg_class c WHERE c.oid=table_oid;
  INSERT INTO public.soe_core_containment_v1_state VALUES(table_name,prior,state,md5(table_name||E'\\n'||prior::text||E'\\n'||state::text||E'\\nsoe-core-containment:v1'));
 END LOOP;
END
$containment$;
SELECT 'core_containment_applied_locally_or_already_current' AS result;
COMMIT;
