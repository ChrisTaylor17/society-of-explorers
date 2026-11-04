-- UNAPPLIED LOCAL CANDIDATE. Coordinate this migration with authenticated
-- Thinker callers requiring a logical request UUID. No provider/action replay
-- guarantee is implied. Existing reward functions and their grants are untouched.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;

DO $preflight$
BEGIN
 IF current_user<>'postgres'
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls
   AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND
   (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
   WHERE r.rolname IN('anon','authenticated','service_role'))
  OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Thinker reward owner or role authority requires review.';
 END IF;
 IF to_regclass('public.soe_thinker_reward_receipts') IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
   AND proname IN('soe_thinker_reward_award','soe_thinker_reward_receipt')) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Thinker reward objects already exist; review before applying.';
 END IF;
 IF (SELECT count(*) FROM pg_class WHERE oid IN(to_regclass('public.members'),to_regclass('public.exp_events'))
   AND relkind='r' AND pg_get_userbyid(relowner)=current_user AND relrowsecurity AND NOT relforcerowsecurity)<>2
  OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.members'::regclass AND NOT attisdropped
   AND ((attname='id' AND atttypid='uuid'::regtype AND attnotnull)
    OR (attname='exp_tokens' AND atttypid='integer'::regtype)))<>2
  OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.exp_events'::regclass AND NOT attisdropped
   AND ((attname='id' AND atttypid='uuid'::regtype AND attnotnull)
    OR (attname='member_id' AND atttypid='uuid'::regtype)
    OR (attname='amount' AND atttypid='integer'::regtype AND attnotnull)
    OR (attname='reason' AND atttypid='text'::regtype)))<>4
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.exp_events'::regclass AND contype='p'
   AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.exp_events'::regclass AND attname='id')]::smallint[])
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.members'::regclass AND contype='p'
   AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='id')]::smallint[])
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','UPDATE'])p WHERE NOT has_table_privilege('service_role','public.members',p))
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT'])p WHERE NOT has_table_privilege('service_role','public.exp_events',p)) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Thinker reward schema or service prerequisites require review.';
 END IF;
END
$preflight$;

CREATE TABLE public.soe_thinker_reward_receipts (
 member_id uuid NOT NULL REFERENCES public.members(id),
 request_id uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 thinker_id text NOT NULL CHECK(length(thinker_id) BETWEEN 1 AND 80 AND thinker_id=btrim(thinker_id)),
 is_reaction boolean NOT NULL,
 amount integer NOT NULL CHECK(amount=CASE WHEN is_reaction THEN 4 ELSE 8 END),
 event_id uuid NOT NULL UNIQUE REFERENCES public.exp_events(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(member_id,request_id)
);
ALTER TABLE public.soe_thinker_reward_receipts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.soe_thinker_reward_receipts IS
 'soe-thinker-rewards:v1; immutable atomic award receipts; actor/request scoped; request digest only, no private prompt; preserve receipts for replay safety';

CREATE FUNCTION public.soe_thinker_reward_award(p_actor uuid,p_request_id uuid,p_request_hash text,p_thinker_id text,p_is_reaction boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $award$
DECLARE prior public.soe_thinker_reward_receipts; event_uuid uuid; award integer;
BEGIN
 IF p_actor IS NULL OR p_request_id IS NULL OR p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$'
  OR p_thinker_id IS NULL OR length(p_thinker_id) NOT BETWEEN 1 AND 80 OR p_thinker_id<>btrim(p_thinker_id)
  OR p_is_reaction IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Use a valid Thinker reward request.';
 END IF;
 -- Every award for this member locks the current balance first. This serializes
 -- this RPC's same-member receipt checks; no transaction spans provider I/O.
 PERFORM 1 FROM public.members WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Member unavailable.'; END IF;
 SELECT * INTO prior FROM public.soe_thinker_reward_receipts WHERE member_id=p_actor AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.request_hash<>p_request_hash OR prior.thinker_id<>p_thinker_id OR prior.is_reaction<>p_is_reaction THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Thinker request key was already used for a different request.';
  END IF;
  RETURN jsonb_build_object('requestId',prior.request_id,'amount',prior.amount,'eventId',prior.event_id,'replayed',true);
 END IF;
 award:=CASE WHEN p_is_reaction THEN 4 ELSE 8 END;
 UPDATE public.members SET exp_tokens=coalesce(exp_tokens,0)+award WHERE id=p_actor;
 INSERT INTO public.exp_events(member_id,amount,reason)
 VALUES(p_actor,award,CASE WHEN p_is_reaction THEN 'Thinker reaction from ' ELSE 'Conversation with ' END||p_thinker_id)
 RETURNING id INTO event_uuid;
 INSERT INTO public.soe_thinker_reward_receipts(member_id,request_id,request_hash,thinker_id,is_reaction,amount,event_id)
 VALUES(p_actor,p_request_id,p_request_hash,p_thinker_id,p_is_reaction,award,event_uuid);
 RETURN jsonb_build_object('requestId',p_request_id,'amount',award,'eventId',event_uuid,'replayed',false);
END
$award$;

CREATE FUNCTION public.soe_thinker_reward_receipt(p_actor uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $receipt$
DECLARE prior public.soe_thinker_reward_receipts;
BEGIN
 IF p_actor IS NULL OR p_request_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Use a valid Thinker receipt request.';
 END IF;
 SELECT * INTO prior FROM public.soe_thinker_reward_receipts WHERE member_id=p_actor AND request_id=p_request_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('requestId',prior.request_id,'amount',prior.amount,'eventId',prior.event_id,'replayed',true);
END
$receipt$;

-- Scrub new-object ACLs inherited from owner default privileges, including
-- unknown explicit grantees. Existing tables/global defaults are not changed.
DO $privileges$
DECLARE r record; target text;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c
  CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a
  WHERE c.oid='public.soe_thinker_reward_receipts'::regclass AND a.grantee<>c.relowner LOOP
  target:=CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.soe_thinker_reward_receipts FROM '||target||' RESTRICT';
 END LOOP;
 FOR r IN SELECT DISTINCT p.oid,a.grantee FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
  WHERE p.oid IN('public.soe_thinker_reward_award(uuid,uuid,text,text,boolean)'::regprocedure,
   'public.soe_thinker_reward_receipt(uuid,uuid)'::regprocedure) AND a.grantee<>p.proowner LOOP
  target:=CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
  EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s RESTRICT',r.oid::regprocedure,target);
 END LOOP;
END
$privileges$;
GRANT SELECT,INSERT ON public.soe_thinker_reward_receipts TO service_role;
GRANT EXECUTE ON FUNCTION public.soe_thinker_reward_award(uuid,uuid,text,text,boolean),public.soe_thinker_reward_receipt(uuid,uuid) TO service_role;

DO $assertions$
BEGIN
 IF has_table_privilege('anon','public.soe_thinker_reward_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  OR has_table_privilege('authenticated','public.soe_thinker_reward_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  OR has_table_privilege('service_role','public.soe_thinker_reward_receipts','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT'])p WHERE NOT has_table_privilege('service_role','public.soe_thinker_reward_receipts',p))
  OR has_function_privilege('anon','public.soe_thinker_reward_award(uuid,uuid,text,text,boolean)','EXECUTE')
  OR has_function_privilege('authenticated','public.soe_thinker_reward_award(uuid,uuid,text,text,boolean)','EXECUTE')
  OR has_function_privilege('anon','public.soe_thinker_reward_receipt(uuid,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','public.soe_thinker_reward_receipt(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Thinker reward privileges require review.';
 END IF;
END
$assertions$;
COMMIT;
