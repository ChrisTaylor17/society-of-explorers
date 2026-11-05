-- UNAPPLIED LOCAL REVIEW DRAFT. No production operation is authorized here.
-- Scope: only public.exp_events table/column grants and RLS, plus an owner-only
-- metadata receipt. No rows, defaults, policies, FK actions or other tables change.
-- Existing direct browser clients lose raw EXP event access intentionally.
-- Captured grants/policy: live-service-metadata-2026-11-04.json. This is not
-- evidence that TRUNCATE is exposed over HTTP; later receipt FKs can block it.
-- The member FK name/actions were not captured: validate the observed endpoint
-- and preserve/fingerprint its actual definition. No FK action is invented.
-- Reward function bodies/EXECUTE grants are separate, unchanged boundaries.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
DO $containment$
DECLARE
 table_oid oid; receipt_oid oid; owner_oid oid; state jsonb; prior jsonb; col jsonb; entry jsonb;
 role_name text; grantee_sql text; grant_option text; applied boolean;
BEGIN
 IF current_user IN('anon','authenticated','service_role')
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated','service_role'))
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
  OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='public' AND pg_get_userbyid(nspowner) IN('anon','authenticated'))
  OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment role or schema authority requires review.';
 END IF;
 table_oid:=to_regclass('public.exp_events');
 IF table_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=table_oid AND relkind='r' AND NOT relispartition AND NOT relhassubclass
    AND pg_get_userbyid(relowner)=current_user)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=table_oid OR inhparent=table_oid)
  OR (SELECT count(*) FROM pg_attribute WHERE attrelid=table_oid AND attnum>0 AND NOT attisdropped)<>5
  OR EXISTS(SELECT 1 FROM (VALUES
   ('id','uuid',true),('created_at','timestamp with time zone',false),
    ('member_id','uuid',false),('amount','integer',true),('reason','text',false)
  ) expected(name,type,not_null)
  LEFT JOIN pg_attribute a ON a.attrelid=table_oid AND a.attname=expected.name AND NOT a.attisdropped
  WHERE a.attnum IS NULL OR format_type(a.atttypid,a.atttypmod)<>expected.type OR a.attnotnull<>expected.not_null OR a.attidentity<>'' OR a.attgenerated<>'')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=table_oid AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=table_oid AND k.contype='f' AND k.convalidated
     AND k.confrelid=to_regclass('public.members')
     AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=table_oid AND attname='member_id' AND NOT attisdropped)]::smallint[]
     AND k.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.confrelid AND attname='id' AND atttypid='uuid'::regtype AND NOT attisdropped)]::smallint[]) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment ownership or schema requires review.';
 END IF;
 -- The captured owner-SELECT policy is preserved; no new policy is guessed.
 IF (SELECT count(*) FROM pg_policy WHERE polrelid=table_oid)<>1
  OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=table_oid AND polname='EXP events visible to owner'
   AND polcmd='r' AND polpermissive AND polroles=ARRAY[0]::oid[] AND polwithcheck IS NULL
   AND regexp_replace(pg_get_expr(polqual,polrelid),'[[:space:]]','','g')=
     '(member_idIN(SELECTmembers.idFROMmembersWHERE(members.supabase_auth_id=auth.uid())))') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event policy requires review.';
 END IF;
 IF NOT has_table_privilege('service_role',table_oid,'SELECT') OR NOT has_table_privilege('service_role',table_oid,'INSERT')
  OR NOT has_table_privilege('service_role',table_oid,'UPDATE') OR NOT has_table_privilege('service_role',table_oid,'DELETE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment must preserve existing service CRUD.';
 END IF;
 SELECT relowner INTO owner_oid FROM pg_class WHERE oid=table_oid;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=table_oid
   AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated'))) AND a.grantor<>owner_oid)
  OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a WHERE c.attrelid=table_oid
   AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated'))) AND a.grantor<>owner_oid) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment delegated browser grantors require review.';
 END IF;
 receipt_oid:=to_regclass('public.soe_exp_events_containment_v1_state');
 applied:=receipt_oid IS NOT NULL;
 IF applied THEN
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=receipt_oid AND c.relkind='r' AND NOT c.relispartition AND NOT c.relhassubclass
   AND c.relrowsecurity AND NOT c.relforcerowsecurity AND pg_get_userbyid(c.relowner)=current_user
   AND obj_description(c.oid,'pg_class')='soe-exp-events-containment:v1:owned')
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=receipt_oid)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=receipt_oid AND NOT tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=receipt_oid OR inhparent=receipt_oid)
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped)<>4
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped
    AND attnotnull AND attidentity='' AND attgenerated='' AND NOT atthasdef AND
    ((attname IN('target_table','integrity_digest') AND atttypid='text'::regtype) OR (attname IN('prior_state','post_state') AND atttypid='jsonb'::regtype)))<>4
   OR (SELECT count(*) FROM pg_constraint WHERE conrelid=receipt_oid)<>1
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=receipt_oid AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (target_table)')
   OR (SELECT count(*) FROM pg_index WHERE indrelid=receipt_oid)<>1
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=receipt_oid AND a.grantee<>c.relowner)
   OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x JOIN pg_class c ON c.oid=a.attrelid WHERE c.oid=receipt_oid AND x.grantee<>c.relowner) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment receipt collision requires review.';
  END IF;
  IF (SELECT count(*) FROM public.soe_exp_events_containment_v1_state)<>1
   OR EXISTS(SELECT 1 FROM public.soe_exp_events_containment_v1_state s WHERE s.target_table<>'exp_events'
    OR jsonb_typeof(s.prior_state)<>'object' OR jsonb_typeof(s.post_state)<>'object'
    OR s.integrity_digest IS DISTINCT FROM md5(s.target_table||E'\n'||s.prior_state::text||E'\n'||s.post_state::text||E'\nsoe-exp-events-containment:v1')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment receipt integrity requires review.';
  END IF;
 END IF;
 LOCK TABLE public.exp_events IN ACCESS EXCLUSIVE MODE;
 IF applied THEN LOCK TABLE public.soe_exp_events_containment_v1_state IN ACCESS EXCLUSIVE MODE; END IF;
 -- Recheck all authority, schema and receipt acceptance after relation locks.
 IF current_user IN('anon','authenticated','service_role')
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated','service_role'))
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
  OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='public' AND pg_get_userbyid(nspowner) IN('anon','authenticated'))
  OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment role or schema authority requires review.';
 END IF;
 table_oid:=to_regclass('public.exp_events');
 IF table_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=table_oid AND relkind='r' AND NOT relispartition AND NOT relhassubclass
    AND pg_get_userbyid(relowner)=current_user)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=table_oid OR inhparent=table_oid)
  OR (SELECT count(*) FROM pg_attribute WHERE attrelid=table_oid AND attnum>0 AND NOT attisdropped)<>5
  OR EXISTS(SELECT 1 FROM (VALUES
   ('id','uuid',true),('created_at','timestamp with time zone',false),
    ('member_id','uuid',false),('amount','integer',true),('reason','text',false)
  ) expected(name,type,not_null)
  LEFT JOIN pg_attribute a ON a.attrelid=table_oid AND a.attname=expected.name AND NOT a.attisdropped
  WHERE a.attnum IS NULL OR format_type(a.atttypid,a.atttypmod)<>expected.type OR a.attnotnull<>expected.not_null OR a.attidentity<>'' OR a.attgenerated<>'')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=table_oid AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=table_oid AND k.contype='f' AND k.convalidated
     AND k.confrelid=to_regclass('public.members')
     AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=table_oid AND attname='member_id' AND NOT attisdropped)]::smallint[]
     AND k.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.confrelid AND attname='id' AND atttypid='uuid'::regtype AND NOT attisdropped)]::smallint[]) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment ownership or schema requires review.';
 END IF;
 -- The captured owner-SELECT policy is preserved; no new policy is guessed.
 IF (SELECT count(*) FROM pg_policy WHERE polrelid=table_oid)<>1
  OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=table_oid AND polname='EXP events visible to owner'
   AND polcmd='r' AND polpermissive AND polroles=ARRAY[0]::oid[] AND polwithcheck IS NULL
   AND regexp_replace(pg_get_expr(polqual,polrelid),'[[:space:]]','','g')=
     '(member_idIN(SELECTmembers.idFROMmembersWHERE(members.supabase_auth_id=auth.uid())))') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event policy requires review.';
 END IF;
 IF NOT has_table_privilege('service_role',table_oid,'SELECT') OR NOT has_table_privilege('service_role',table_oid,'INSERT')
  OR NOT has_table_privilege('service_role',table_oid,'UPDATE') OR NOT has_table_privilege('service_role',table_oid,'DELETE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment must preserve existing service CRUD.';
 END IF;
 SELECT relowner INTO owner_oid FROM pg_class WHERE oid=table_oid;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=table_oid
   AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated'))) AND a.grantor<>owner_oid)
  OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a WHERE c.attrelid=table_oid
   AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated'))) AND a.grantor<>owner_oid) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment delegated browser grantors require review.';
 END IF;
 receipt_oid:=to_regclass('public.soe_exp_events_containment_v1_state');
 applied:=receipt_oid IS NOT NULL;
 IF applied THEN
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=receipt_oid AND c.relkind='r' AND NOT c.relispartition AND NOT c.relhassubclass
   AND c.relrowsecurity AND NOT c.relforcerowsecurity AND pg_get_userbyid(c.relowner)=current_user
   AND obj_description(c.oid,'pg_class')='soe-exp-events-containment:v1:owned')
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=receipt_oid)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=receipt_oid AND NOT tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=receipt_oid OR inhparent=receipt_oid)
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped)<>4
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped
    AND attnotnull AND attidentity='' AND attgenerated='' AND NOT atthasdef AND
    ((attname IN('target_table','integrity_digest') AND atttypid='text'::regtype) OR (attname IN('prior_state','post_state') AND atttypid='jsonb'::regtype)))<>4
   OR (SELECT count(*) FROM pg_constraint WHERE conrelid=receipt_oid)<>1
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=receipt_oid AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (target_table)')
   OR (SELECT count(*) FROM pg_index WHERE indrelid=receipt_oid)<>1
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=receipt_oid AND a.grantee<>c.relowner)
   OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x JOIN pg_class c ON c.oid=a.attrelid WHERE c.oid=receipt_oid AND x.grantee<>c.relowner) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment receipt collision requires review.';
  END IF;
  IF (SELECT count(*) FROM public.soe_exp_events_containment_v1_state)<>1
   OR EXISTS(SELECT 1 FROM public.soe_exp_events_containment_v1_state s WHERE s.target_table<>'exp_events'
    OR jsonb_typeof(s.prior_state)<>'object' OR jsonb_typeof(s.post_state)<>'object'
    OR s.integrity_digest IS DISTINCT FROM md5(s.target_table||E'\n'||s.prior_state::text||E'\n'||s.post_state::text||E'\nsoe-exp-events-containment:v1')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment receipt integrity requires review.';
  END IF;
 END IF;
 IF applied THEN
 SELECT jsonb_build_object(
  'oid',c.oid::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
  'comment_md5',md5(obj_description(c.oid,'pg_class')),
  'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb),
  'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'collation',a.attcollation::text,
   'default_md5',md5(pg_get_expr(d.adbin,d.adrelid)),'comment_md5',md5(col_description(a.attrelid,a.attnum)),
   'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable) FROM aclexplode(a.attacl) x),'[]'::jsonb)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
  'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',k.oid::text,'name',k.conname,'definition_md5',md5(pg_get_constraintdef(k.oid)),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred,'no_inherit',k.connoinherit) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
  'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',i.indexrelid::text,'definition_md5',md5(pg_get_indexdef(i.indexrelid)),'valid',i.indisvalid,'ready',i.indisready,'immediate',i.indimmediate,'nulls_not_distinct',i.indnullsnotdistinct) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'[]'::jsonb),
  'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',p.oid::text,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid))) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb),
  'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',t.oid::text,'definition_md5',md5(pg_get_triggerdef(t.oid)),'enabled',t.tgenabled,'internal',t.tgisinternal,'constraint',t.tgconstraint::text,
   'function',t.tgfoid::text,'function_body_md5',md5(p.prosrc),'function_owner',pg_get_userbyid(p.proowner),'function_security_definer',p.prosecdef,'function_config_md5',md5(p.proconfig::text),'function_acl_md5',md5(p.proacl::text),'function_volatile',p.provolatile,'function_strict',p.proisstrict,'function_parallel',p.proparallel)
   ORDER BY t.oid) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=c.oid),'[]'::jsonb)
 ) INTO state FROM pg_class c WHERE c.oid=table_oid;
  IF state IS DISTINCT FROM (SELECT post_state FROM public.soe_exp_events_containment_v1_state WHERE target_table='exp_events') THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment catalog changed; reviewed forward reconciliation is required.';
  END IF;
 END IF;
 IF applied THEN RETURN; END IF;
 CREATE TABLE public.soe_exp_events_containment_v1_state(target_table text PRIMARY KEY,prior_state jsonb NOT NULL,post_state jsonb NOT NULL,integrity_digest text NOT NULL);
 COMMENT ON TABLE public.soe_exp_events_containment_v1_state IS 'soe-exp-events-containment:v1:owned';
 ALTER TABLE public.soe_exp_events_containment_v1_state ENABLE ROW LEVEL SECURITY;
 -- Remove every inherited non-owner default grant on this newly owned receipt.
 FOR role_name IN SELECT DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
  FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
  WHERE c.oid='public.soe_exp_events_containment_v1_state'::regclass AND a.grantee<>c.relowner LOOP
  grantee_sql:=CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END;
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.soe_exp_events_containment_v1_state FROM '||grantee_sql;
 END LOOP;
 SELECT jsonb_build_object(
  'oid',c.oid::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
  'comment_md5',md5(obj_description(c.oid,'pg_class')),
  'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb),
  'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'collation',a.attcollation::text,
   'default_md5',md5(pg_get_expr(d.adbin,d.adrelid)),'comment_md5',md5(col_description(a.attrelid,a.attnum)),
   'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable) FROM aclexplode(a.attacl) x),'[]'::jsonb)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
  'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',k.oid::text,'name',k.conname,'definition_md5',md5(pg_get_constraintdef(k.oid)),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred,'no_inherit',k.connoinherit) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
  'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',i.indexrelid::text,'definition_md5',md5(pg_get_indexdef(i.indexrelid)),'valid',i.indisvalid,'ready',i.indisready,'immediate',i.indimmediate,'nulls_not_distinct',i.indnullsnotdistinct) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'[]'::jsonb),
  'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',p.oid::text,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid))) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb),
  'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',t.oid::text,'definition_md5',md5(pg_get_triggerdef(t.oid)),'enabled',t.tgenabled,'internal',t.tgisinternal,'constraint',t.tgconstraint::text,
   'function',t.tgfoid::text,'function_body_md5',md5(p.prosrc),'function_owner',pg_get_userbyid(p.proowner),'function_security_definer',p.prosecdef,'function_config_md5',md5(p.proconfig::text),'function_acl_md5',md5(p.proacl::text),'function_volatile',p.provolatile,'function_strict',p.proisstrict,'function_parallel',p.proparallel)
   ORDER BY t.oid) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=c.oid),'[]'::jsonb)
 ) INTO state FROM pg_class c WHERE c.oid=table_oid;
 prior:=state;
 REVOKE ALL PRIVILEGES ON TABLE public.exp_events FROM PUBLIC,anon,authenticated;
 FOR col IN SELECT value FROM jsonb_array_elements(prior->'columns') LOOP
  EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.exp_events FROM PUBLIC,anon,authenticated',col->>'name');
 END LOOP;
 ALTER TABLE public.exp_events ENABLE ROW LEVEL SECURITY;
 -- PUBLIC can supply a service privilege. Abort atomically instead of broadening
 -- service grants or committing a containment that silently disables the server.
 IF NOT has_table_privilege('service_role',table_oid,'SELECT') OR NOT has_table_privilege('service_role',table_oid,'INSERT')
  OR NOT has_table_privilege('service_role',table_oid,'UPDATE') OR NOT has_table_privilege('service_role',table_oid,'DELETE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment would remove effective service CRUD.';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN('anon','authenticated') AND
  (has_table_privilege(r.oid,table_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR has_any_column_privilege(r.oid,table_oid,'SELECT,INSERT,UPDATE,REFERENCES'))) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='EXP event containment effective browser authority requires review.';
 END IF;
 SELECT jsonb_build_object(
  'oid',c.oid::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
  'comment_md5',md5(obj_description(c.oid,'pg_class')),
  'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb),
  'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'collation',a.attcollation::text,
   'default_md5',md5(pg_get_expr(d.adbin,d.adrelid)),'comment_md5',md5(col_description(a.attrelid,a.attnum)),
   'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable) FROM aclexplode(a.attacl) x),'[]'::jsonb)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
  'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',k.oid::text,'name',k.conname,'definition_md5',md5(pg_get_constraintdef(k.oid)),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred,'no_inherit',k.connoinherit) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
  'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',i.indexrelid::text,'definition_md5',md5(pg_get_indexdef(i.indexrelid)),'valid',i.indisvalid,'ready',i.indisready,'immediate',i.indimmediate,'nulls_not_distinct',i.indnullsnotdistinct) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'[]'::jsonb),
  'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',p.oid::text,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles::text,'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid))) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb),
  'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('oid',t.oid::text,'definition_md5',md5(pg_get_triggerdef(t.oid)),'enabled',t.tgenabled,'internal',t.tgisinternal,'constraint',t.tgconstraint::text,
   'function',t.tgfoid::text,'function_body_md5',md5(p.prosrc),'function_owner',pg_get_userbyid(p.proowner),'function_security_definer',p.prosecdef,'function_config_md5',md5(p.proconfig::text),'function_acl_md5',md5(p.proacl::text),'function_volatile',p.provolatile,'function_strict',p.proisstrict,'function_parallel',p.proparallel)
   ORDER BY t.oid) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=c.oid),'[]'::jsonb)
 ) INTO state FROM pg_class c WHERE c.oid=table_oid;
 INSERT INTO public.soe_exp_events_containment_v1_state VALUES('exp_events',prior,state,md5('exp_events'||E'\n'||prior::text||E'\n'||state::text||E'\nsoe-exp-events-containment:v1'));
END
$containment$;
SELECT 'exp_events_containment_applied_locally_or_already_current' AS result;
COMMIT;
