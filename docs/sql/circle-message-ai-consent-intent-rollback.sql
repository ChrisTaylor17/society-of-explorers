-- UNAPPLIED LOCAL CANDIDATE. No provider activation, production SQL or deployment approval.
-- Apply after original per-message consent and allowance; preserve their historical sources.
-- Pinned service-only definers retain original row locks while denying raw service writes.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;
DO $guard$
DECLARE mode text; r record; p pg_proc; owner_id oid; service_id oid; expected_hash text; expected_marker text; service_exec boolean;
BEGIN
 SELECT oid INTO owner_id FROM pg_roles WHERE rolname=current_user;
 SELECT oid INTO service_id FROM pg_roles WHERE rolname='service_role' AND rolbypassrls
  AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication;
 IF current_user IN('anon','authenticated','service_role') OR service_id IS NULL
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles member_role ON member_role.oid=m.member WHERE member_role.rolname IN('anon','authenticated','service_role'))
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') AND has_schema_privilege(oid,'public','CREATE')) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent owner or role authority requires review.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.circle_message_ai_consents') AND relkind='r'
  AND relowner=owner_id AND relrowsecurity AND NOT relforcerowsecurity
  AND obj_description(oid,'pg_class')='soe-message-ai-consent:v1; fixed direct-Anthropic policy; legacy absence is false/revision zero; no content or advice stored') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent table identity requires review.';
 END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid::regtype::text,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid='public.circle_message_ai_consents'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM '[["message_id","uuid",true,null],["policy","text",true,null],["content_hash","text",true,null],["allowed","boolean",true,"false"],["consent_revision","bigint",true,"0"],["updated_at","timestamp with time zone",true,"clock_timestamp()"]]'::jsonb
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.circle_message_ai_consents'::regclass AND attnum>0 AND (attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL))
  OR (SELECT jsonb_object_agg(conname,pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.circle_message_ai_consents'::regclass) IS DISTINCT FROM '{"circle_message_ai_consents_consent_revision_check":"CHECK (((consent_revision >= 0) AND (consent_revision <= ''9007199254740991''::bigint)))","circle_message_ai_consents_content_hash_check":"CHECK ((content_hash ~ ''^[0-9a-f]{64}$''::text))","circle_message_ai_consents_message_id_fkey":"FOREIGN KEY (message_id) REFERENCES seminar_messages(id) ON DELETE RESTRICT","circle_message_ai_consents_pkey":"PRIMARY KEY (message_id, policy)","circle_message_ai_consents_policy_check":"CHECK ((policy = ''anthropic-message-review-v1''::text))"}'::jsonb
  OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.circle_message_ai_consents'::regclass AND (NOT convalidated OR condeferrable OR condeferred))
  OR (SELECT count(*) FROM pg_index WHERE indrelid='public.circle_message_ai_consents'::regclass)<>1
  OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid='public.circle_message_ai_consents'::regclass AND (NOT indisprimary OR NOT indisunique OR NOT indisvalid OR NOT indisready))
  OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.circle_message_ai_consents'::regclass)
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.circle_message_ai_consents'::regclass AND NOT tgisinternal)
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='public.circle_message_ai_consents'::regclass)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='public.circle_message_ai_consents'::regclass OR inhparent='public.circle_message_ai_consents'::regclass) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent table definition requires review.';
 END IF;
 FOREACH mode IN ARRAY ARRAY['seminar_messages','book_cohorts','book_cohort_members','circle_message_states','circle_message_reports','circle_reports','circle_reviewer_grants'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||mode) AND relkind='r' AND relowner=owner_id) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent dependency ownership requires review.';
  END IF;
 END LOOP;
 mode:=CASE obj_description(to_regprocedure('public.soe_circle_message_ai_consent_set(uuid,uuid,uuid,bigint,text,text,boolean)'),'pg_proc')
  WHEN 'soe-message-ai-consent-intent:v1' THEN 'enabled' WHEN 'soe-message-ai-consent-intent:v1:disabled' THEN 'disabled' ELSE 'original' END;
 IF mode='original' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent successor must be installed.'; END IF;
 FOR r IN SELECT * FROM (VALUES
  ('soe_circle_message_ai_consent_state(uuid,uuid,uuid)','521ea34de532262120a279c28edc96d8','plpgsql','v','jsonb','p_actor,p_circle_id,p_message_id',true),
  ('soe_circle_message_ai_consent_set(uuid,uuid,uuid,bigint,text,text,boolean)','5460273b446e68e002f8a0ed8ecd0ea3','plpgsql','v','jsonb','p_actor,p_circle_id,p_message_id,p_expected_consent_revision,p_content_hash,p_policy,p_allowed',true),
  ('soe_circle_message_ai_snapshot(uuid,uuid,uuid)','58ce933e210f6783fca23b3e518815f2','plpgsql','v','jsonb','p_actor,p_circle_id,p_message_id',true),
  ('_soe_circle_message_hash(text)','539c426a009fd70c5f9668bca389a95f','sql','i','text','p_content',false),
  ('_soe_circle_message_lock(uuid,uuid,uuid)','79c6f0f81eaa69d85ae431d5edcb1814','plpgsql','v','public.seminar_messages','p_actor,p_circle_id,p_message_id',false),
  ('_soe_circle_message_review_authorize(uuid,uuid,uuid)','41063e9f27f52c55657dcef77da67e3f','plpgsql','v','void','p_actor,p_circle_id,p_message_id',false),
  ('_soe_circle_message_reviewer_allowed(uuid,uuid,uuid)','a839fe02c5ab3c458e9c90061adcd4d1','sql','v','boolean','p_actor,p_circle_id,p_message_id',false)
 ) AS expected(signature,hash,language,volatility,result_type,arg_names,is_consent) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.'||r.signature);
  expected_hash:=CASE WHEN mode<>'original' AND r.signature LIKE 'soe_circle_message_ai_consent_set(%' THEN '6c5692c590339c1ef1a034f194afa745' ELSE r.hash END;
  expected_marker:=CASE WHEN r.is_consent AND mode<>'original' THEN 'soe-message-ai-consent-intent:v1'||CASE WHEN mode='disabled' AND r.signature LIKE 'soe_circle_message_ai_consent_set(%' THEN ':disabled' ELSE '' END ELSE NULL END;
  IF p.oid IS NULL OR p.proowner<>owner_id OR md5(p.prosrc)<>expected_hash
   OR p.prosecdef IS DISTINCT FROM (r.is_consent AND mode<>'original')
   OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname=r.language)
   OR p.provolatile::text<>r.volatility OR p.prorettype<>to_regtype(r.result_type)
   OR p.proargnames IS DISTINCT FROM string_to_array(r.arg_names,',') OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
   OR p.prokind<>'f' OR p.proisstrict OR p.proleakproof OR p.proretset OR p.proparallel<>'u'
   OR p.pronargdefaults<>0 OR p.provariadic<>0 OR p.procost<>100 OR p.prorows<>0 OR p.probin IS NOT NULL
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM expected_marker
   OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=p.proname)<>1 THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent function definition requires review.';
  END IF;
  service_exec:=NOT(mode='disabled' AND r.signature LIKE 'soe_circle_message_ai_consent_set(%');
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>owner_id
    AND (a.grantee<>service_id OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
   OR has_function_privilege(service_id,p.oid,'EXECUTE') IS DISTINCT FROM service_exec
   OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND has_function_privilege(oid,p.oid,'EXECUTE')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent function grants require review.';
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid='public.circle_message_ai_consents'::regclass AND a.grantee<>owner_id
    AND (a.grantee<>service_id OR a.is_grantable OR NOT(a.privilege_type=ANY(CASE WHEN mode='original' THEN ARRAY['SELECT','INSERT','UPDATE'] ELSE ARRAY['SELECT'] END))))
  OR NOT has_table_privilege(service_id,'public.circle_message_ai_consents','SELECT')
  OR has_table_privilege(service_id,'public.circle_message_ai_consents','INSERT') IS DISTINCT FROM (mode='original')
  OR has_table_privilege(service_id,'public.circle_message_ai_consents','UPDATE') IS DISTINCT FROM (mode='original')
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND
    (has_table_privilege(oid,'public.circle_message_ai_consents','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_any_column_privilege(oid,'public.circle_message_ai_consents','SELECT,INSERT,UPDATE,REFERENCES'))) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent table grants require review.';
 END IF;
END
$guard$;
LOCK TABLE public.circle_message_ai_consents IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE mode text; r record; p pg_proc; owner_id oid; service_id oid; expected_hash text; expected_marker text; service_exec boolean;
BEGIN
 SELECT oid INTO owner_id FROM pg_roles WHERE rolname=current_user;
 SELECT oid INTO service_id FROM pg_roles WHERE rolname='service_role' AND rolbypassrls
  AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication;
 IF current_user IN('anon','authenticated','service_role') OR service_id IS NULL
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles member_role ON member_role.oid=m.member WHERE member_role.rolname IN('anon','authenticated','service_role'))
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') AND has_schema_privilege(oid,'public','CREATE')) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent owner or role authority requires review.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.circle_message_ai_consents') AND relkind='r'
  AND relowner=owner_id AND relrowsecurity AND NOT relforcerowsecurity
  AND obj_description(oid,'pg_class')='soe-message-ai-consent:v1; fixed direct-Anthropic policy; legacy absence is false/revision zero; no content or advice stored') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent table identity requires review.';
 END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid::regtype::text,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid='public.circle_message_ai_consents'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM '[["message_id","uuid",true,null],["policy","text",true,null],["content_hash","text",true,null],["allowed","boolean",true,"false"],["consent_revision","bigint",true,"0"],["updated_at","timestamp with time zone",true,"clock_timestamp()"]]'::jsonb
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.circle_message_ai_consents'::regclass AND attnum>0 AND (attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL))
  OR (SELECT jsonb_object_agg(conname,pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.circle_message_ai_consents'::regclass) IS DISTINCT FROM '{"circle_message_ai_consents_consent_revision_check":"CHECK (((consent_revision >= 0) AND (consent_revision <= ''9007199254740991''::bigint)))","circle_message_ai_consents_content_hash_check":"CHECK ((content_hash ~ ''^[0-9a-f]{64}$''::text))","circle_message_ai_consents_message_id_fkey":"FOREIGN KEY (message_id) REFERENCES seminar_messages(id) ON DELETE RESTRICT","circle_message_ai_consents_pkey":"PRIMARY KEY (message_id, policy)","circle_message_ai_consents_policy_check":"CHECK ((policy = ''anthropic-message-review-v1''::text))"}'::jsonb
  OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.circle_message_ai_consents'::regclass AND (NOT convalidated OR condeferrable OR condeferred))
  OR (SELECT count(*) FROM pg_index WHERE indrelid='public.circle_message_ai_consents'::regclass)<>1
  OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid='public.circle_message_ai_consents'::regclass AND (NOT indisprimary OR NOT indisunique OR NOT indisvalid OR NOT indisready))
  OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.circle_message_ai_consents'::regclass)
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.circle_message_ai_consents'::regclass AND NOT tgisinternal)
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='public.circle_message_ai_consents'::regclass)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='public.circle_message_ai_consents'::regclass OR inhparent='public.circle_message_ai_consents'::regclass) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent table definition requires review.';
 END IF;
 FOREACH mode IN ARRAY ARRAY['seminar_messages','book_cohorts','book_cohort_members','circle_message_states','circle_message_reports','circle_reports','circle_reviewer_grants'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||mode) AND relkind='r' AND relowner=owner_id) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent dependency ownership requires review.';
  END IF;
 END LOOP;
 mode:=CASE obj_description(to_regprocedure('public.soe_circle_message_ai_consent_set(uuid,uuid,uuid,bigint,text,text,boolean)'),'pg_proc')
  WHEN 'soe-message-ai-consent-intent:v1' THEN 'enabled' WHEN 'soe-message-ai-consent-intent:v1:disabled' THEN 'disabled' ELSE 'original' END;
 IF mode='original' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent successor must be installed.'; END IF;
 FOR r IN SELECT * FROM (VALUES
  ('soe_circle_message_ai_consent_state(uuid,uuid,uuid)','521ea34de532262120a279c28edc96d8','plpgsql','v','jsonb','p_actor,p_circle_id,p_message_id',true),
  ('soe_circle_message_ai_consent_set(uuid,uuid,uuid,bigint,text,text,boolean)','5460273b446e68e002f8a0ed8ecd0ea3','plpgsql','v','jsonb','p_actor,p_circle_id,p_message_id,p_expected_consent_revision,p_content_hash,p_policy,p_allowed',true),
  ('soe_circle_message_ai_snapshot(uuid,uuid,uuid)','58ce933e210f6783fca23b3e518815f2','plpgsql','v','jsonb','p_actor,p_circle_id,p_message_id',true),
  ('_soe_circle_message_hash(text)','539c426a009fd70c5f9668bca389a95f','sql','i','text','p_content',false),
  ('_soe_circle_message_lock(uuid,uuid,uuid)','79c6f0f81eaa69d85ae431d5edcb1814','plpgsql','v','public.seminar_messages','p_actor,p_circle_id,p_message_id',false),
  ('_soe_circle_message_review_authorize(uuid,uuid,uuid)','41063e9f27f52c55657dcef77da67e3f','plpgsql','v','void','p_actor,p_circle_id,p_message_id',false),
  ('_soe_circle_message_reviewer_allowed(uuid,uuid,uuid)','a839fe02c5ab3c458e9c90061adcd4d1','sql','v','boolean','p_actor,p_circle_id,p_message_id',false)
 ) AS expected(signature,hash,language,volatility,result_type,arg_names,is_consent) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.'||r.signature);
  expected_hash:=CASE WHEN mode<>'original' AND r.signature LIKE 'soe_circle_message_ai_consent_set(%' THEN '6c5692c590339c1ef1a034f194afa745' ELSE r.hash END;
  expected_marker:=CASE WHEN r.is_consent AND mode<>'original' THEN 'soe-message-ai-consent-intent:v1'||CASE WHEN mode='disabled' AND r.signature LIKE 'soe_circle_message_ai_consent_set(%' THEN ':disabled' ELSE '' END ELSE NULL END;
  IF p.oid IS NULL OR p.proowner<>owner_id OR md5(p.prosrc)<>expected_hash
   OR p.prosecdef IS DISTINCT FROM (r.is_consent AND mode<>'original')
   OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname=r.language)
   OR p.provolatile::text<>r.volatility OR p.prorettype<>to_regtype(r.result_type)
   OR p.proargnames IS DISTINCT FROM string_to_array(r.arg_names,',') OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
   OR p.prokind<>'f' OR p.proisstrict OR p.proleakproof OR p.proretset OR p.proparallel<>'u'
   OR p.pronargdefaults<>0 OR p.provariadic<>0 OR p.procost<>100 OR p.prorows<>0 OR p.probin IS NOT NULL
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM expected_marker
   OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=p.proname)<>1 THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent function definition requires review.';
  END IF;
  service_exec:=NOT(mode='disabled' AND r.signature LIKE 'soe_circle_message_ai_consent_set(%');
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>owner_id
    AND (a.grantee<>service_id OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
   OR has_function_privilege(service_id,p.oid,'EXECUTE') IS DISTINCT FROM service_exec
   OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND has_function_privilege(oid,p.oid,'EXECUTE')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent function grants require review.';
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid='public.circle_message_ai_consents'::regclass AND a.grantee<>owner_id
    AND (a.grantee<>service_id OR a.is_grantable OR NOT(a.privilege_type=ANY(CASE WHEN mode='original' THEN ARRAY['SELECT','INSERT','UPDATE'] ELSE ARRAY['SELECT'] END))))
  OR NOT has_table_privilege(service_id,'public.circle_message_ai_consents','SELECT')
  OR has_table_privilege(service_id,'public.circle_message_ai_consents','INSERT') IS DISTINCT FROM (mode='original')
  OR has_table_privilege(service_id,'public.circle_message_ai_consents','UPDATE') IS DISTINCT FROM (mode='original')
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND
    (has_table_privilege(oid,'public.circle_message_ai_consents','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_any_column_privilege(oid,'public.circle_message_ai_consents','SELECT,INSERT,UPDATE,REFERENCES'))) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent table grants require review.';
 END IF;
END
$guard$;
REVOKE EXECUTE ON FUNCTION public.soe_circle_message_ai_consent_set(uuid,uuid,uuid,bigint,text,text,boolean) FROM service_role RESTRICT;
COMMENT ON FUNCTION public.soe_circle_message_ai_consent_set(uuid,uuid,uuid,bigint,text,text,boolean) IS 'soe-message-ai-consent-intent:v1:disabled';
DO $guard$
DECLARE mode text; r record; p pg_proc; owner_id oid; service_id oid; expected_hash text; expected_marker text; service_exec boolean;
BEGIN
 SELECT oid INTO owner_id FROM pg_roles WHERE rolname=current_user;
 SELECT oid INTO service_id FROM pg_roles WHERE rolname='service_role' AND rolbypassrls
  AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication;
 IF current_user IN('anon','authenticated','service_role') OR service_id IS NULL
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles member_role ON member_role.oid=m.member WHERE member_role.rolname IN('anon','authenticated','service_role'))
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') AND has_schema_privilege(oid,'public','CREATE')) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent owner or role authority requires review.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.circle_message_ai_consents') AND relkind='r'
  AND relowner=owner_id AND relrowsecurity AND NOT relforcerowsecurity
  AND obj_description(oid,'pg_class')='soe-message-ai-consent:v1; fixed direct-Anthropic policy; legacy absence is false/revision zero; no content or advice stored') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent table identity requires review.';
 END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid::regtype::text,a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid='public.circle_message_ai_consents'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM '[["message_id","uuid",true,null],["policy","text",true,null],["content_hash","text",true,null],["allowed","boolean",true,"false"],["consent_revision","bigint",true,"0"],["updated_at","timestamp with time zone",true,"clock_timestamp()"]]'::jsonb
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.circle_message_ai_consents'::regclass AND attnum>0 AND (attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL))
  OR (SELECT jsonb_object_agg(conname,pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.circle_message_ai_consents'::regclass) IS DISTINCT FROM '{"circle_message_ai_consents_consent_revision_check":"CHECK (((consent_revision >= 0) AND (consent_revision <= ''9007199254740991''::bigint)))","circle_message_ai_consents_content_hash_check":"CHECK ((content_hash ~ ''^[0-9a-f]{64}$''::text))","circle_message_ai_consents_message_id_fkey":"FOREIGN KEY (message_id) REFERENCES seminar_messages(id) ON DELETE RESTRICT","circle_message_ai_consents_pkey":"PRIMARY KEY (message_id, policy)","circle_message_ai_consents_policy_check":"CHECK ((policy = ''anthropic-message-review-v1''::text))"}'::jsonb
  OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.circle_message_ai_consents'::regclass AND (NOT convalidated OR condeferrable OR condeferred))
  OR (SELECT count(*) FROM pg_index WHERE indrelid='public.circle_message_ai_consents'::regclass)<>1
  OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid='public.circle_message_ai_consents'::regclass AND (NOT indisprimary OR NOT indisunique OR NOT indisvalid OR NOT indisready))
  OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.circle_message_ai_consents'::regclass)
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.circle_message_ai_consents'::regclass AND NOT tgisinternal)
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='public.circle_message_ai_consents'::regclass)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid='public.circle_message_ai_consents'::regclass OR inhparent='public.circle_message_ai_consents'::regclass) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent table definition requires review.';
 END IF;
 FOREACH mode IN ARRAY ARRAY['seminar_messages','book_cohorts','book_cohort_members','circle_message_states','circle_message_reports','circle_reports','circle_reviewer_grants'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||mode) AND relkind='r' AND relowner=owner_id) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent dependency ownership requires review.';
  END IF;
 END LOOP;
 mode:=CASE obj_description(to_regprocedure('public.soe_circle_message_ai_consent_set(uuid,uuid,uuid,bigint,text,text,boolean)'),'pg_proc')
  WHEN 'soe-message-ai-consent-intent:v1' THEN 'enabled' WHEN 'soe-message-ai-consent-intent:v1:disabled' THEN 'disabled' ELSE 'original' END;
 IF mode='original' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent successor must be installed.'; END IF;
 FOR r IN SELECT * FROM (VALUES
  ('soe_circle_message_ai_consent_state(uuid,uuid,uuid)','521ea34de532262120a279c28edc96d8','plpgsql','v','jsonb','p_actor,p_circle_id,p_message_id',true),
  ('soe_circle_message_ai_consent_set(uuid,uuid,uuid,bigint,text,text,boolean)','5460273b446e68e002f8a0ed8ecd0ea3','plpgsql','v','jsonb','p_actor,p_circle_id,p_message_id,p_expected_consent_revision,p_content_hash,p_policy,p_allowed',true),
  ('soe_circle_message_ai_snapshot(uuid,uuid,uuid)','58ce933e210f6783fca23b3e518815f2','plpgsql','v','jsonb','p_actor,p_circle_id,p_message_id',true),
  ('_soe_circle_message_hash(text)','539c426a009fd70c5f9668bca389a95f','sql','i','text','p_content',false),
  ('_soe_circle_message_lock(uuid,uuid,uuid)','79c6f0f81eaa69d85ae431d5edcb1814','plpgsql','v','public.seminar_messages','p_actor,p_circle_id,p_message_id',false),
  ('_soe_circle_message_review_authorize(uuid,uuid,uuid)','41063e9f27f52c55657dcef77da67e3f','plpgsql','v','void','p_actor,p_circle_id,p_message_id',false),
  ('_soe_circle_message_reviewer_allowed(uuid,uuid,uuid)','a839fe02c5ab3c458e9c90061adcd4d1','sql','v','boolean','p_actor,p_circle_id,p_message_id',false)
 ) AS expected(signature,hash,language,volatility,result_type,arg_names,is_consent) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.'||r.signature);
  expected_hash:=CASE WHEN mode<>'original' AND r.signature LIKE 'soe_circle_message_ai_consent_set(%' THEN '6c5692c590339c1ef1a034f194afa745' ELSE r.hash END;
  expected_marker:=CASE WHEN r.is_consent AND mode<>'original' THEN 'soe-message-ai-consent-intent:v1'||CASE WHEN mode='disabled' AND r.signature LIKE 'soe_circle_message_ai_consent_set(%' THEN ':disabled' ELSE '' END ELSE NULL END;
  IF p.oid IS NULL OR p.proowner<>owner_id OR md5(p.prosrc)<>expected_hash
   OR p.prosecdef IS DISTINCT FROM (r.is_consent AND mode<>'original')
   OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname=r.language)
   OR p.provolatile::text<>r.volatility OR p.prorettype<>to_regtype(r.result_type)
   OR p.proargnames IS DISTINCT FROM string_to_array(r.arg_names,',') OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
   OR p.prokind<>'f' OR p.proisstrict OR p.proleakproof OR p.proretset OR p.proparallel<>'u'
   OR p.pronargdefaults<>0 OR p.provariadic<>0 OR p.procost<>100 OR p.prorows<>0 OR p.probin IS NOT NULL
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM expected_marker
   OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=p.proname)<>1 THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent function definition requires review.';
  END IF;
  service_exec:=NOT(mode='disabled' AND r.signature LIKE 'soe_circle_message_ai_consent_set(%');
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>owner_id
    AND (a.grantee<>service_id OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
   OR has_function_privilege(service_id,p.oid,'EXECUTE') IS DISTINCT FROM service_exec
   OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND has_function_privilege(oid,p.oid,'EXECUTE')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent function grants require review.';
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid='public.circle_message_ai_consents'::regclass AND a.grantee<>owner_id
    AND (a.grantee<>service_id OR a.is_grantable OR NOT(a.privilege_type=ANY(CASE WHEN mode='original' THEN ARRAY['SELECT','INSERT','UPDATE'] ELSE ARRAY['SELECT'] END))))
  OR NOT has_table_privilege(service_id,'public.circle_message_ai_consents','SELECT')
  OR has_table_privilege(service_id,'public.circle_message_ai_consents','INSERT') IS DISTINCT FROM (mode='original')
  OR has_table_privilege(service_id,'public.circle_message_ai_consents','UPDATE') IS DISTINCT FROM (mode='original')
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND
    (has_table_privilege(oid,'public.circle_message_ai_consents','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_any_column_privilege(oid,'public.circle_message_ai_consents','SELECT,INSERT,UPDATE,REFERENCES'))) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Consent intent table grants require review.';
 END IF;
END
$guard$;
COMMIT;
