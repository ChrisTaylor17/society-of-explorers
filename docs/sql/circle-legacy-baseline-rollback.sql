-- UNAPPLIED LOCAL REVIEW DRAFT. No production database has been changed.
-- Exactly three legacy Circle tables; no row updates, backfill, author inference,
-- permissive policies, role provisioning, foreign-key repair or default changes.
-- Baseline preflight/reapply/rollback are valid only before later Circle DDL.
-- Unused rollback only. Any subsequent Circle DDL/catalog drift refuses rollback.
-- A non-null additive label refuses rollback; no labels or original rows are erased.
-- Restoring previous grants reopens the prior raw Data API access and requires review.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;
DO $baseline$
DECLARE
 targets text[]:=ARRAY['book_cohorts','book_cohort_members','seminar_messages'];
 table_name text; table_oid oid; receipt_oid oid; owner_oid oid;
 state jsonb; prior jsonb; col jsonb; entry jsonb; role_name text; grantee_sql text; grant_option text; applied boolean;
BEGIN
 IF current_user IN('anon','authenticated','service_role')
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated'))
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
  OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='public' AND pg_get_userbyid(nspowner) IN('anon','authenticated'))
  OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline role or schema authority requires review.';
 END IF;
 FOREACH table_name IN ARRAY targets LOOP
  table_oid:=to_regclass(format('public.%I',table_name));
  IF table_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=table_oid AND relkind='r' AND NOT relispartition AND NOT relhassubclass
   AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)=current_user)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=table_oid OR inhparent=table_oid) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline table ownership requires review.';
  END IF;
  IF NOT has_table_privilege('service_role',table_oid,'SELECT') OR NOT has_table_privilege('service_role',table_oid,'INSERT')
   OR NOT has_table_privilege('service_role',table_oid,'UPDATE') OR NOT has_table_privilege('service_role',table_oid,'DELETE') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline must preserve existing service CRUD.';
  END IF;
  SELECT relowner INTO owner_oid FROM pg_class WHERE oid=table_oid;
  IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid=table_oid AND a.grantee<>0 AND a.grantee<>owner_oid
    AND a.grantee NOT IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated','service_role')))
   OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a WHERE c.attrelid=table_oid AND a.grantee<>0 AND a.grantee<>owner_oid
    AND a.grantee NOT IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated','service_role'))) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline unexpected grantees require review.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid=table_oid AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated'))) AND a.grantor<>owner_oid)
   OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a WHERE c.attrelid=table_oid
    AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated'))) AND a.grantor<>owner_oid) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline delegated grants require review.';
  END IF;
 END LOOP;
 receipt_oid:=to_regclass('public.soe_circle_legacy_baseline_v1_state');
 applied:=receipt_oid IS NOT NULL;
 IF applied THEN
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=receipt_oid AND c.relkind='r' AND NOT c.relispartition AND NOT c.relhassubclass
   AND c.relrowsecurity AND NOT c.relforcerowsecurity AND pg_get_userbyid(c.relowner)=current_user
   AND obj_description(c.oid,'pg_class')='soe-circle-legacy-baseline:v1:owned')
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=receipt_oid)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=receipt_oid AND NOT tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=receipt_oid OR inhparent=receipt_oid)
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped)<>4
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped
    AND attnotnull AND attidentity='' AND attgenerated='' AND NOT atthasdef AND
     ((attname='target_table' AND atttypid='text'::regtype) OR (attname IN('prior_state','post_state') AND atttypid='jsonb'::regtype)
      OR (attname='integrity_digest' AND atttypid='text'::regtype)))<>4
   OR (SELECT count(*) FROM pg_constraint WHERE conrelid=receipt_oid)<>1
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=receipt_oid AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (target_table)')
   OR (SELECT count(*) FROM pg_index WHERE indrelid=receipt_oid)<>1
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=receipt_oid AND a.grantee<>c.relowner)
   OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x JOIN pg_class c ON c.oid=a.attrelid WHERE c.oid=receipt_oid AND x.grantee<>c.relowner) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline receipt collision requires review.';
  END IF;
  IF (SELECT count(*) FROM public.soe_circle_legacy_baseline_v1_state)<>3
   OR EXISTS(SELECT 1 FROM public.soe_circle_legacy_baseline_v1_state s WHERE NOT(s.target_table=ANY(targets))
    OR jsonb_typeof(s.prior_state)<>'object' OR jsonb_typeof(s.post_state)<>'object'
    OR s.integrity_digest IS DISTINCT FROM md5(s.target_table||E'\n'||s.prior_state::text||E'\n'||s.post_state::text||E'\nsoe-circle-legacy-baseline:v1')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline receipt integrity requires review.';
  END IF;
 END IF;
 LOCK TABLE public.book_cohorts,public.book_cohort_members,public.seminar_messages IN ACCESS EXCLUSIVE MODE;
 IF applied THEN LOCK TABLE public.soe_circle_legacy_baseline_v1_state IN ACCESS EXCLUSIVE MODE; END IF;
 -- Revalidate authority and all accepted metadata after acquiring relation locks.
 IF current_user IN('anon','authenticated','service_role')
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated'))
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
  OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='public' AND pg_get_userbyid(nspowner) IN('anon','authenticated'))
  OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline role or schema authority requires review.';
 END IF;
 FOREACH table_name IN ARRAY targets LOOP
  table_oid:=to_regclass(format('public.%I',table_name));
  IF table_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=table_oid AND relkind='r' AND NOT relispartition AND NOT relhassubclass
   AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)=current_user)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=table_oid OR inhparent=table_oid) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline table ownership requires review.';
  END IF;
  IF NOT has_table_privilege('service_role',table_oid,'SELECT') OR NOT has_table_privilege('service_role',table_oid,'INSERT')
   OR NOT has_table_privilege('service_role',table_oid,'UPDATE') OR NOT has_table_privilege('service_role',table_oid,'DELETE') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline must preserve existing service CRUD.';
  END IF;
  SELECT relowner INTO owner_oid FROM pg_class WHERE oid=table_oid;
  IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid=table_oid AND a.grantee<>0 AND a.grantee<>owner_oid
    AND a.grantee NOT IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated','service_role')))
   OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a WHERE c.attrelid=table_oid AND a.grantee<>0 AND a.grantee<>owner_oid
    AND a.grantee NOT IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated','service_role'))) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline unexpected grantees require review.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid=table_oid AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated'))) AND a.grantor<>owner_oid)
   OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a WHERE c.attrelid=table_oid
    AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated'))) AND a.grantor<>owner_oid) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline delegated grants require review.';
  END IF;
 END LOOP;
 receipt_oid:=to_regclass('public.soe_circle_legacy_baseline_v1_state');
 applied:=receipt_oid IS NOT NULL;
 IF applied THEN
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=receipt_oid AND c.relkind='r' AND NOT c.relispartition AND NOT c.relhassubclass
   AND c.relrowsecurity AND NOT c.relforcerowsecurity AND pg_get_userbyid(c.relowner)=current_user
   AND obj_description(c.oid,'pg_class')='soe-circle-legacy-baseline:v1:owned')
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=receipt_oid)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=receipt_oid AND NOT tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=receipt_oid OR inhparent=receipt_oid)
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped)<>4
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped
    AND attnotnull AND attidentity='' AND attgenerated='' AND NOT atthasdef AND
     ((attname='target_table' AND atttypid='text'::regtype) OR (attname IN('prior_state','post_state') AND atttypid='jsonb'::regtype)
      OR (attname='integrity_digest' AND atttypid='text'::regtype)))<>4
   OR (SELECT count(*) FROM pg_constraint WHERE conrelid=receipt_oid)<>1
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=receipt_oid AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (target_table)')
   OR (SELECT count(*) FROM pg_index WHERE indrelid=receipt_oid)<>1
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=receipt_oid AND a.grantee<>c.relowner)
   OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x JOIN pg_class c ON c.oid=a.attrelid WHERE c.oid=receipt_oid AND x.grantee<>c.relowner) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline receipt collision requires review.';
  END IF;
  IF (SELECT count(*) FROM public.soe_circle_legacy_baseline_v1_state)<>3
   OR EXISTS(SELECT 1 FROM public.soe_circle_legacy_baseline_v1_state s WHERE NOT(s.target_table=ANY(targets))
    OR jsonb_typeof(s.prior_state)<>'object' OR jsonb_typeof(s.post_state)<>'object'
    OR s.integrity_digest IS DISTINCT FROM md5(s.target_table||E'\n'||s.prior_state::text||E'\n'||s.post_state::text||E'\nsoe-circle-legacy-baseline:v1')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline receipt integrity requires review.';
  END IF;
 END IF;
 IF NOT applied THEN RETURN; END IF;
 IF applied THEN
  FOREACH table_name IN ARRAY targets LOOP
   table_oid:=to_regclass(format('public.%I',table_name));
  SELECT jsonb_build_object(
   'oid',c.oid::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
   'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb),
   'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'collation',a.attcollation::text,
    'default_md5',md5(pg_get_expr(d.adbin,d.adrelid)),'comment_md5',md5(col_description(a.attrelid,a.attnum)),
    'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable) FROM aclexplode(a.attacl) x),'[]'::jsonb))
    ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
   'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',k.oid::text,'name',k.conname,'definition_md5',md5(pg_get_constraintdef(k.oid)),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
   'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',i.indexrelid::text,'definition_md5',md5(pg_get_indexdef(i.indexrelid)),'valid',i.indisvalid,'ready',i.indisready) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'[]'::jsonb),
   'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',p.oid::text,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid))) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb),
   'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',t.oid::text,'definition_md5',md5(pg_get_triggerdef(t.oid)),'enabled',t.tgenabled,'function',t.tgfoid::text) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=c.oid),'[]'::jsonb),
   'member_name_dependencies',COALESCE((SELECT jsonb_agg(jsonb_build_object('class',d.classid::text,'object',d.objid::text,'subobject',d.objsubid,'type',d.deptype) ORDER BY d.classid,d.objid,d.objsubid,d.deptype) FROM pg_depend d JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='member_name' AND NOT a.attisdropped WHERE d.refclassid='pg_class'::regclass AND d.refobjid=c.oid AND d.refobjsubid=a.attnum),'[]'::jsonb)
  ) INTO state FROM pg_class c WHERE c.oid=table_oid;
   IF state IS DISTINCT FROM (SELECT s.post_state FROM public.soe_circle_legacy_baseline_v1_state s WHERE s.target_table=table_name) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline catalog changed; reviewed forward reconciliation is required.';
   END IF;
  END LOOP;
 END IF;
 IF EXISTS(SELECT 1 FROM public.seminar_messages WHERE member_name IS NOT NULL) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline additive label has been used; forward reconciliation is required.';
 END IF;
 -- All target post-states have been validated while locked, before any restoration.
 ALTER TABLE public.seminar_messages DROP COLUMN member_name RESTRICT;
 FOREACH table_name IN ARRAY targets LOOP
  table_oid:=to_regclass(format('public.%I',table_name));
  SELECT s.prior_state INTO prior FROM public.soe_circle_legacy_baseline_v1_state s WHERE s.target_table=table_name;
  FOR entry IN SELECT value FROM jsonb_array_elements(prior->'acl') WHERE value->>'grantee' IN('PUBLIC','anon','authenticated') LOOP
   grantee_sql:=CASE WHEN entry->>'grantee'='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(entry->>'grantee') END;
   grant_option:=CASE WHEN (entry->>'grantable')::boolean THEN ' WITH GRANT OPTION' ELSE '' END;
   EXECUTE format('GRANT %s ON TABLE public.%I TO %s%s',entry->>'privilege',table_name,grantee_sql,grant_option);
  END LOOP;
  FOR col IN SELECT value FROM jsonb_array_elements(prior->'columns') LOOP
   FOR entry IN SELECT value FROM jsonb_array_elements(col->'acl') WHERE value->>'grantee' IN('PUBLIC','anon','authenticated') LOOP
    grantee_sql:=CASE WHEN entry->>'grantee'='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(entry->>'grantee') END;
    grant_option:=CASE WHEN (entry->>'grantable')::boolean THEN ' WITH GRANT OPTION' ELSE '' END;
    EXECUTE format('GRANT %s (%I) ON TABLE public.%I TO %s%s',entry->>'privilege',col->>'name',table_name,grantee_sql,grant_option);
   END LOOP;
  END LOOP;
  IF NOT (prior->>'rls')::boolean THEN EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY',table_name); END IF;
  SELECT jsonb_build_object(
   'oid',c.oid::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
   'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb),
   'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'collation',a.attcollation::text,
    'default_md5',md5(pg_get_expr(d.adbin,d.adrelid)),'comment_md5',md5(col_description(a.attrelid,a.attnum)),
    'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable) FROM aclexplode(a.attacl) x),'[]'::jsonb))
    ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
   'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',k.oid::text,'name',k.conname,'definition_md5',md5(pg_get_constraintdef(k.oid)),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
   'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',i.indexrelid::text,'definition_md5',md5(pg_get_indexdef(i.indexrelid)),'valid',i.indisvalid,'ready',i.indisready) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'[]'::jsonb),
   'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',p.oid::text,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid))) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb),
   'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',t.oid::text,'definition_md5',md5(pg_get_triggerdef(t.oid)),'enabled',t.tgenabled,'function',t.tgfoid::text) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=c.oid),'[]'::jsonb),
   'member_name_dependencies',COALESCE((SELECT jsonb_agg(jsonb_build_object('class',d.classid::text,'object',d.objid::text,'subobject',d.objsubid,'type',d.deptype) ORDER BY d.classid,d.objid,d.objsubid,d.deptype) FROM pg_depend d JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='member_name' AND NOT a.attisdropped WHERE d.refclassid='pg_class'::regclass AND d.refobjid=c.oid AND d.refobjsubid=a.attnum),'[]'::jsonb)
  ) INTO state FROM pg_class c WHERE c.oid=table_oid;
  IF state IS DISTINCT FROM prior THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy Circle baseline prior state could not be restored exactly.';
  END IF;
 END LOOP;
 DROP TABLE public.soe_circle_legacy_baseline_v1_state RESTRICT;
END
$baseline$;
SELECT 'circle_legacy_baseline_unused_rollback_complete' AS result;
COMMIT;
