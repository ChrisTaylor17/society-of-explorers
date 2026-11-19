-- UNAPPLIED LOCAL CANDIDATE. Apply only after the reviewed admission cutover
-- on an isolated restore. Keep the application release disabled until verified.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.book_cohorts, public.book_cohort_members IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF to_regnamespace('soe_book_salons_private') IS NOT NULL
  OR to_regprocedure('public.soe_circle_legacy_salon_create(uuid,uuid,jsonb)') IS NOT NULL
  OR to_regprocedure('soe_circle_admission_private.require_actor(uuid)') IS NULL
  OR to_regprocedure('public._soe_circle_participation_actor(uuid)') IS NULL
  OR to_regclass('soe_account_deletion_private.identity_gate') IS NULL
  OR to_regclass('soe_account_deletion_private.processing') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
  OR has_any_column_privilege('service_role','public.book_cohort_members','INSERT')
  OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN(
    to_regprocedure('soe_circle_admission_private.require_actor(uuid)'),
    to_regprocedure('public._soe_circle_participation_actor(uuid)'))
    AND p.proowner<>current_user::regrole) THEN
  RAISE EXCEPTION 'Review the admission and identity prerequisites before salon creation';
 END IF;
END $$;

CREATE SCHEMA soe_book_salons_private;
REVOKE ALL ON SCHEMA soe_book_salons_private FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA soe_book_salons_private TO service_role;

-- No duplicate free-text copy. Preserve a tombstone if the salon is removed,
-- so a late retry cannot recreate it. Account erasure cascades these receipts.
CREATE TABLE soe_book_salons_private.creation_receipts (
 actor_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 input_hash bytea NOT NULL CHECK (octet_length(input_hash)=32),
 cohort_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_member_id,request_id)
);
ALTER TABLE soe_book_salons_private.creation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soe_book_salons_private.creation_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Server-only authority: the HTTP handler resolves the current wallet/provider
-- identity, binds expectedMemberId, and supplies p_actor. No browser may execute
-- either function. A browser auth.uid() is not present on this service transport.
-- Definer authority is confined to this private transaction, never raw grants.
CREATE FUNCTION soe_book_salons_private.create_salon(p_actor uuid,p_request_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r soe_book_salons_private.creation_receipts; c public.book_cohorts;
 input_hash bytea; start_at timestamptz; replayed boolean:=false;
BEGIN
 PERFORM soe_circle_admission_private.require_actor(p_actor);
 PERFORM public._soe_circle_participation_actor(p_actor);
 IF p_request_id IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object'
  OR NOT(p_input ?& ARRAY['bookId','title','description','maxMembers','startDate','thinkerId'])
  OR p_input-ARRAY['bookId','title','description','maxMembers','startDate','thinkerId']<>'{}'::jsonb THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid salon request';
 END IF;
 IF jsonb_typeof(p_input->'bookId') IS DISTINCT FROM 'string'
  OR p_input->>'bookId' !~ '^[a-z0-9_-]{1,80}$' OR p_input->>'bookId'='soe-circles-path'
  OR jsonb_typeof(p_input->'title') IS DISTINCT FROM 'string'
  OR length(btrim(p_input->>'title')) NOT BETWEEN 1 AND 160 OR length(p_input->>'title')>160
  OR p_input->>'title' ~ '[[:cntrl:]]'
  OR jsonb_typeof(p_input->'description') NOT IN('string','null') OR length(p_input->>'description')>1000
  OR jsonb_typeof(p_input->'maxMembers') IS DISTINCT FROM 'number' OR p_input->>'maxMembers' !~ '^([2-9]|1[0-2])$'
  OR jsonb_typeof(p_input->'thinkerId') IS DISTINCT FROM 'string' OR p_input->>'thinkerId' !~ '^[a-z0-9_-]{1,80}$'
  OR jsonb_typeof(p_input->'startDate') NOT IN('string','null') THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid salon details';
 END IF;
 IF p_input->>'startDate' IS NOT NULL THEN
  IF p_input->>'startDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?Z$' THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid salon date';
  END IF;
  BEGIN start_at:=(p_input->>'startDate')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid salon date';
  END;
 END IF;
 input_hash:=sha256(convert_to(p_input::text,'UTF8'));
 SELECT * INTO r FROM soe_book_salons_private.creation_receipts
  WHERE actor_member_id=p_actor AND request_id=p_request_id;
 IF FOUND THEN
  IF r.input_hash<>input_hash THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request already used for different details'; END IF;
  SELECT * INTO c FROM public.book_cohorts WHERE id=r.cohort_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='Original salon unavailable'; END IF;
  IF c.created_by IS DISTINCT FROM p_actor OR c.book_id='soe-circles-path' THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Original salon membership changed';
  END IF;
  replayed:=true;
 ELSE
  INSERT INTO public.book_cohorts(book_id,title,description,max_members,start_date,thinker_id,status,created_by)
   VALUES(p_input->>'bookId',btrim(p_input->>'title'),p_input->>'description',(p_input->>'maxMembers')::integer,
    coalesce(start_at,clock_timestamp()),p_input->>'thinkerId','forming',p_actor) RETURNING * INTO c;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Salon insertion unavailable'; END IF;
  INSERT INTO public.book_cohort_members(cohort_id,member_id) VALUES(c.id,p_actor);
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Creator membership unavailable'; END IF;
  INSERT INTO soe_book_salons_private.creation_receipts(actor_member_id,request_id,input_hash,cohort_id)
   VALUES(p_actor,p_request_id,input_hash,c.id);
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Creation receipt unavailable'; END IF;
 END IF;
 -- Hold the membership until this confirmation commits. An old receipt never
 -- silently restores a membership that was subsequently removed.
 PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Original salon membership changed'; END IF;
 RETURN jsonb_build_object('cohort',jsonb_build_object('id',c.id,'created_by',p_actor),
  'requestId',p_request_id,'creatorJoined',true,'replayed',replayed);
END $$;

CREATE FUNCTION public.soe_circle_legacy_salon_create(p_actor uuid,p_request_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT soe_book_salons_private.create_salon(p_actor,p_request_id,p_input);
$$;

-- Scrub inherited default ACL recipients as well as the named browser roles.
DO $$ DECLARE x record; grantee text; BEGIN
 FOR x IN SELECT DISTINCT a.grantee FROM pg_namespace n,
  LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
  WHERE n.oid='soe_book_salons_private'::regnamespace AND a.grantee<>n.nspowner LOOP
  grantee:=CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END;
  EXECUTE format('REVOKE ALL ON SCHEMA soe_book_salons_private FROM %s',grantee);
 END LOOP;
 FOR x IN SELECT DISTINCT p.oid::regprocedure AS fn,a.grantee FROM pg_proc p,
  LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.oid IN('public.soe_circle_legacy_salon_create(uuid,uuid,jsonb)'::regprocedure,
    'soe_book_salons_private.create_salon(uuid,uuid,jsonb)'::regprocedure) AND a.grantee<>p.proowner LOOP
  grantee:=CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',x.fn,grantee);
 END LOOP;
 FOR x IN SELECT DISTINCT a.grantee FROM pg_class c,
  LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  WHERE c.oid='soe_book_salons_private.creation_receipts'::regclass AND a.grantee<>c.relowner LOOP
  grantee:=CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END;
  EXECUTE format('REVOKE ALL ON TABLE soe_book_salons_private.creation_receipts FROM %s',grantee);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA soe_book_salons_private TO service_role;
REVOKE ALL ON FUNCTION public.soe_circle_legacy_salon_create(uuid,uuid,jsonb),
 soe_book_salons_private.create_salon(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.soe_circle_legacy_salon_create(uuid,uuid,jsonb),
 soe_book_salons_private.create_salon(uuid,uuid,jsonb) TO service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN('anon','authenticated') AND
   (r.rolbypassrls OR r.rolsuper OR has_function_privilege(r.oid,'public.soe_circle_legacy_salon_create(uuid,uuid,jsonb)','EXECUTE')
    OR has_schema_privilege(r.oid,'soe_book_salons_private','USAGE,CREATE')))
  OR has_any_column_privilege('service_role','public.book_cohort_members','INSERT')
  OR has_schema_privilege('service_role','soe_book_salons_private','CREATE') THEN
  RAISE EXCEPTION 'Salon creation authority exceeds the reviewed service boundary';
 END IF;
END $$;
COMMIT;
