-- UNAPPLIED LOCAL CANDIDATE. No live execution or production approval is implied.
-- Only EXECUTE on the exact three reward RPCs changes; bodies/attributes/owners,
-- service/other-role access, current_prompt_member_id, policies and tables stay.
-- Reward bodies are UNKNOWN locally. Fingerprints are captured dynamically.
-- Coordinate trusted-owner DDL; receipt locking does NOT lock function catalogs.
BEGIN READ ONLY;
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
DO $reward$
DECLARE
 signatures text[]:=ARRAY['public.add_exp(uuid,integer,text)','public.increment_exp(uuid,integer)','public.increment_exp_tokens(uuid,integer)'];
 signature text; proc_oid oid; receipt_oid oid; state jsonb; prior jsonb; entry jsonb; expected_acl jsonb;
 role_name text; grantee_sql text; grant_option text; applied boolean;
BEGIN
 IF current_user<>'postgres'
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated'))
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
  OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reward RPC containment owner or role authority requires review.';
 END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('add_exp','increment_exp','increment_exp_tokens'))<>3
  OR EXISTS(SELECT 1 FROM (VALUES
   ('public.add_exp(uuid,integer,text)','plpgsql',true,ARRAY['p_member_id','p_amount','p_reason']::text[]),
   ('public.increment_exp(uuid,integer)','sql',false,ARRAY['member_id_input','amount_input']::text[]),
   ('public.increment_exp_tokens(uuid,integer)','sql',false,ARRAY['member_id_input','amount_input']::text[])
  ) expected(signature,language,security_definer,arg_names)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
  WHERE p.oid IS NULL OR pg_get_userbyid(p.proowner)<>'postgres' OR p.prokind<>'f' OR p.proretset
   OR p.prorettype<>'void'::regtype OR p.provolatile<>'v' OR p.prosecdef<>expected.security_definer
   OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname=expected.language)
   OR p.proargnames IS DISTINCT FROM expected.arg_names OR p.proargmodes IS NOT NULL OR p.proconfig IS NOT NULL) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reward RPC signatures, ownership or observed attributes require review.';
 END IF;
 FOREACH signature IN ARRAY signatures LOOP
  proc_oid:=to_regprocedure(signature);
  IF NOT has_function_privilege('service_role',proc_oid,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_depend WHERE refclassid='pg_proc'::regclass AND refobjid=proc_oid)
   OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=proc_oid AND (a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reward RPC service access, direct dependencies or delegated grants require review.';
  END IF;
 END LOOP;
 receipt_oid:=to_regclass('public.soe_reward_rpc_containment_v1_state');
 applied:=receipt_oid IS NOT NULL;
 IF applied THEN
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=receipt_oid AND c.relkind='r' AND NOT c.relispartition AND NOT c.relhassubclass
    AND c.relrowsecurity AND NOT c.relforcerowsecurity AND pg_get_userbyid(c.relowner)=current_user
    AND obj_description(c.oid,'pg_class')='soe-reward-rpc-containment:v1:owned')
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=receipt_oid)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=receipt_oid AND NOT tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=receipt_oid OR inhparent=receipt_oid)
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped)<>4
   OR (SELECT count(*) FROM pg_attribute WHERE attrelid=receipt_oid AND attnum>0 AND NOT attisdropped AND attnotnull AND NOT atthasdef AND attidentity='' AND attgenerated=''
    AND ((attname IN('target_signature','integrity_digest') AND atttypid='text'::regtype) OR (attname IN('prior_state','post_state') AND atttypid='jsonb'::regtype)))<>4
   OR (SELECT count(*) FROM pg_constraint WHERE conrelid=receipt_oid)<>1
   OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=receipt_oid AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (target_signature)')
   OR (SELECT count(*) FROM pg_index WHERE indrelid=receipt_oid)<>1
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=receipt_oid AND a.grantee<>c.relowner)
   OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x JOIN pg_class c ON c.oid=a.attrelid WHERE c.oid=receipt_oid AND x.grantee<>c.relowner) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reward RPC containment receipt collision requires review.';
  END IF;
  IF (SELECT count(*) FROM public.soe_reward_rpc_containment_v1_state)<>3
   OR EXISTS(SELECT 1 FROM public.soe_reward_rpc_containment_v1_state s WHERE NOT(s.target_signature=ANY(signatures))
    OR jsonb_typeof(s.prior_state)<>'object' OR jsonb_typeof(s.post_state)<>'object'
    OR s.integrity_digest IS DISTINCT FROM md5(s.target_signature||E'\n'||s.prior_state::text||E'\n'||s.post_state::text||E'\nsoe-reward-rpc-containment:v1')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reward RPC containment receipt integrity requires review.';
  END IF;
 END IF;
 IF applied THEN
  FOREACH signature IN ARRAY signatures LOOP
   proc_oid:=to_regprocedure(signature);
  SELECT jsonb_build_object(
   'oid',p.oid::text,'schema',n.nspname,'name',p.proname,'owner',pg_get_userbyid(p.proowner),
   'language',(SELECT lanname FROM pg_language WHERE oid=p.prolang),'kind',p.prokind,'result',p.prorettype::text,
   'setof',p.proretset,'security_definer',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,'leakproof',p.proleakproof,'parallel',p.proparallel,
   'argument_types',p.proargtypes::text,'all_argument_types',p.proallargtypes::text,'argument_names',p.proargnames,'argument_modes',p.proargmodes,
   'variadic',p.provariadic::text,'default_count',p.pronargdefaults,'argument_defaults_md5',md5(p.proargdefaults::text),
   'config_md5',md5(p.proconfig::text),'cost',p.procost,'rows',p.prorows,'support',p.prosupport::text,
   'body_md5',md5(p.prosrc),'body_characters',char_length(p.prosrc),'binary_md5',md5(p.probin),'sql_body_md5',md5(p.prosqlbody::text),
   'comment_md5',md5(obj_description(p.oid,'pg_proc')),
   'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable)
    FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb)
  ) INTO state FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.oid=proc_oid;
   IF state IS DISTINCT FROM (SELECT post_state FROM public.soe_reward_rpc_containment_v1_state WHERE target_signature=signature) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reward RPC containment state drift requires reviewed reconciliation.';
   END IF;
  END LOOP;
 END IF;
END
$reward$;
SELECT 'reward_rpc_containment_preflight_passed' AS result;
COMMIT;
