-- Owner-reviewed draft. Rehearse after the Circle relationship phase.
-- Supabase Auth and Storage stay provider-managed. This phase reads them to
-- verify the supported provider removal and changes only SoE-owned data.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.members IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE soe_account_deletion_private.identity_removals (
  request_id uuid PRIMARY KEY REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT,
  reviewed_scope jsonb NOT NULL,
  prepared_at timestamptz NOT NULL,
  verified_at timestamptz CHECK (verified_at >= prepared_at)
);
CREATE TABLE soe_account_deletion_private.identity_removal_context (
  tx xid8 PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT
);
ALTER TABLE soe_account_deletion_private.identity_removals ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_account_deletion_private.identity_removal_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soe_account_deletion_private.identity_removals,soe_account_deletion_private.identity_removal_context
  FROM PUBLIC,anon,authenticated,service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS p WHERE p.oid='soe_account_deletion_private.serialize_identity_change()'::regprocedure
      AND p.proowner=current_user::regrole AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='87ed201862ccdeaf044fd5f86ea87a4a88fa3a505ab21e6daa6133f55d961403'
  ) THEN RAISE EXCEPTION 'Account identity guard requires review' USING ERRCODE='PT409'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION soe_account_deletion_private.serialize_identity_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE = 'PT503';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND to_jsonb(NEW)=to_jsonb(OLD)||'{"supabase_auth_id":null,"wallet_address":null}'::jsonb
    AND EXISTS (
      SELECT 1 FROM soe_account_deletion_private.identity_removal_context AS c
      JOIN soe_account_deletion_private.processing AS p USING (request_id)
      WHERE c.tx=pg_current_xact_id_if_assigned() AND p.member_id=OLD.id
        AND p.auth_user_id IS NOT DISTINCT FROM OLD.supabase_auth_id
        AND p.wallet_hash IS NOT DISTINCT FROM sha256(convert_to(lower(OLD.wallet_address),'UTF8'))
    ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM soe_account_deletion_private.processing AS processing
    WHERE processing.member_id IN (NEW.id, OLD.id)
       OR processing.auth_user_id IN (NEW.supabase_auth_id, OLD.supabase_auth_id)
       OR processing.wallet_hash = sha256(convert_to(lower(NEW.wallet_address), 'UTF8'))
  ) THEN
    RAISE EXCEPTION 'Account removal is in progress' USING ERRCODE = 'PT403';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.check_identity_removal_shape()
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE member_table regclass:='public.members'::regclass;
  identity_fields smallint[];
BEGIN
  SELECT array_agg(a.attnum ORDER BY a.attnum) INTO identity_fields FROM pg_attribute AS a
  WHERE a.attrelid=member_table AND NOT a.attisdropped AND NOT a.attnotnull
    AND ((a.attname='supabase_auth_id' AND a.atttypid='uuid'::regtype)
      OR (a.attname='wallet_address' AND a.atttypid IN ('text'::regtype,'varchar'::regtype)));
  IF cardinality(identity_fields) IS DISTINCT FROM 2
    OR EXISTS (SELECT 1 FROM pg_constraint AS c WHERE c.contype='f' AND c.confrelid=member_table AND c.confkey&&identity_fields)
    OR EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class=member_table)
    OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname='public' AND tablename='members')
    OR EXISTS (
      SELECT 1 FROM (VALUES ('anon'),('authenticated')) AS r(role_name)
      WHERE has_table_privilege(r.role_name,member_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
        OR has_any_column_privilege(r.role_name,member_table,'SELECT,INSERT,UPDATE')
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid=member_table AND tgname='soe_serialize_member_erasure' AND tgtype=31 AND tgenabled='O'
        AND tgfoid='soe_account_deletion_private.serialize_identity_change()'::regprocedure
        AND tgattr::smallint[] @> identity_fields
        AND (SELECT attnum FROM pg_attribute WHERE attrelid=member_table AND attname='id' AND NOT attisdropped)=ANY(tgattr::smallint[])
    )
    OR EXISTS (
      SELECT 1 FROM pg_trigger AS t WHERE t.tgrelid=member_table AND NOT t.tgisinternal AND (t.tgtype::int & 16)<>0
        AND (cardinality(t.tgattr::smallint[])=0 OR t.tgattr::smallint[]&&identity_fields)
        AND t.tgname NOT IN ('soe_serialize_member_erasure','soe_member_profile_revision_guard')
    ) THEN
    RAISE EXCEPTION 'Member identity links require review' USING ERRCODE='PT409';
  END IF;
END;
$$;

-- An unprivileged read must fail instead of interpreting filtered provider or
-- storage rows as absent. Optional Auth tables with user_id are included.
CREATE FUNCTION soe_account_deletion_private.identity_provider_scope(p_auth uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog SET row_security = off AS $$
DECLARE users regclass:=to_regclass('auth.users');
  user_key smallint;
  member_auth_key smallint;
  target record;
  matched bigint;
  records jsonb:='{}'::jsonb;
  storage jsonb:='{}'::jsonb;
  outside_links jsonb:='{}'::jsonb;
  user_present boolean:=false;
  predicate text;
BEGIN
  IF p_auth IS NULL THEN
    RETURN '{"userPresent":false,"relatedRecords":{},"ownedStorage":{},"otherReferences":{}}'::jsonb;
  END IF;
  SELECT attnum INTO user_key FROM pg_attribute WHERE attrelid=users AND attname='id' AND atttypid='uuid'::regtype AND NOT attisdropped;
  SELECT attnum INTO member_auth_key FROM pg_attribute WHERE attrelid='public.members'::regclass
    AND attname='supabase_auth_id' AND NOT attisdropped;
  IF user_key IS NULL OR (
    SELECT count(*) FROM pg_attribute AS a JOIN (VALUES
      (to_regclass('auth.sessions'),'uuid'::regtype),(to_regclass('auth.identities'),'uuid'::regtype),
      (to_regclass('auth.refresh_tokens'),'varchar'::regtype)
    ) AS expected(tbl,kind) ON expected.tbl=a.attrelid AND expected.kind=a.atttypid
    WHERE a.attname='user_id' AND NOT a.attisdropped
  )<>3 THEN
    RAISE EXCEPTION 'Provider identity catalog requires review' USING ERRCODE='PT409';
  END IF;

  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id=p_auth) INTO user_present;
  FOR target IN
    SELECT c.oid::regclass AS tbl,c.relname,a.atttypid AS kind FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid=c.relnamespace JOIN pg_attribute AS a ON a.attrelid=c.oid
    WHERE n.nspname='auth' AND c.relkind IN ('r','p') AND NOT c.relispartition
      AND a.attname='user_id' AND NOT a.attisdropped
  LOOP
    IF target.kind='uuid'::regtype THEN
      EXECUTE format('SELECT count(*) FROM %s WHERE user_id=$1',target.tbl) INTO matched USING p_auth;
    ELSIF target.kind IN ('text'::regtype,'varchar'::regtype) THEN
      EXECUTE format('SELECT count(*) FROM %s WHERE user_id=$1',target.tbl) INTO matched USING p_auth::text;
    ELSE
      RAISE EXCEPTION 'Unexpected provider user reference' USING ERRCODE='PT409';
    END IF;
    IF matched>0 THEN records:=records||jsonb_build_object(target.relname,matched); END IF;
  END LOOP;

  FOR target IN SELECT * FROM (VALUES ('storage.objects',to_regclass('storage.objects')),
      ('storage.buckets',to_regclass('storage.buckets'))) AS t(label,tbl) LOOP
    SELECT string_agg(CASE WHEN a.attname='owner' THEN 'owner=$1' ELSE 'owner_id=$1::text' END,' OR ')
    INTO predicate FROM pg_attribute AS a WHERE a.attrelid=target.tbl AND NOT a.attisdropped
      AND ((a.attname='owner' AND a.atttypid='uuid'::regtype)
        OR (a.attname='owner_id' AND a.atttypid IN ('text'::regtype,'varchar'::regtype)));
    IF predicate IS NULL OR EXISTS (
      SELECT 1 FROM pg_attribute AS a WHERE a.attrelid=target.tbl AND NOT a.attisdropped
        AND ((a.attname='owner' AND a.atttypid<>'uuid'::regtype)
          OR (a.attname='owner_id' AND a.atttypid NOT IN ('text'::regtype,'varchar'::regtype)))
    ) THEN
      RAISE EXCEPTION 'Storage ownership catalog requires review' USING ERRCODE='PT409';
    END IF;
    EXECUTE format('SELECT count(*) FROM %s WHERE %s',target.tbl,predicate) INTO matched USING p_auth;
    IF matched>0 THEN storage:=storage||jsonb_build_object(target.label,matched); END IF;
  END LOOP;

  FOR target IN
    SELECT f.confrelid,f.conrelid::regclass AS tbl,f.confkey,f.conkey,f.confdeltype,f.convalidated,
           a.attname AS column_name,a.atttypid AS kind
    FROM pg_constraint AS f JOIN pg_class AS ref ON ref.oid=f.confrelid
    JOIN pg_namespace AS ref_ns ON ref_ns.oid=ref.relnamespace
    JOIN pg_class AS child ON child.oid=f.conrelid JOIN pg_namespace AS child_ns ON child_ns.oid=child.relnamespace
    JOIN pg_attribute AS a ON a.attrelid=f.conrelid AND a.attnum=f.conkey[1]
    WHERE f.contype='f' AND ref_ns.nspname='auth' AND child_ns.nspname<>'auth'
  LOOP
    IF target.confrelid<>users OR target.confkey<>ARRAY[user_key] OR cardinality(target.conkey)<>1
      OR target.kind<>'uuid'::regtype OR NOT target.convalidated THEN
      RAISE EXCEPTION 'External provider references require review' USING ERRCODE='PT409';
    END IF;
    -- The existing member identity guard prevents this link from returning
    -- once it is cleared. Other cascading or nulling effects need review.
    IF target.tbl='public.members'::regclass AND target.conkey=ARRAY[member_auth_key] THEN CONTINUE; END IF;
    IF target.confdeltype NOT IN ('a','r') THEN
      RAISE EXCEPTION 'Provider deletion has external write effects that require review' USING ERRCODE='PT409';
    END IF;
    EXECUTE format('SELECT count(*) FROM %s WHERE %I=$1',target.tbl,target.column_name) INTO matched USING p_auth;
    IF matched>0 THEN outside_links:=outside_links||jsonb_build_object(target.tbl::text||'.'||target.column_name,matched); END IF;
  END LOOP;

  RETURN jsonb_build_object('userPresent',user_present,'relatedRecords',records,
    'ownedStorage',storage,'otherReferences',outside_links);
END;
$$;

CREATE FUNCTION soe_account_deletion_private.check_identity_prerequisites(p_request uuid,p_member uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE hosted uuid[];
BEGIN
  SELECT ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(r.reviewed_scope->'hostedIds'))
    INTO hosted FROM soe_account_deletion_private.circle_departure_receipts AS r WHERE r.request_id=p_request;
  IF NOT FOUND
    OR NOT EXISTS(SELECT 1 FROM soe_account_deletion_private.private_data_receipts WHERE request_id=p_request)
    OR NOT EXISTS(SELECT 1 FROM soe_account_deletion_private.circle_post_receipts WHERE request_id=p_request)
    OR NOT EXISTS(SELECT 1 FROM soe_account_deletion_private.contact_receipts WHERE request_id=p_request) THEN
    RAISE EXCEPTION 'Earlier erasure steps require verification' USING ERRCODE='PT409';
  END IF;
  PERFORM soe_account_deletion_private.check_private_data_shape();
  PERFORM soe_account_deletion_private.check_contact_erasure_shape();
  PERFORM soe_account_deletion_private.check_circle_departure_shape();
  IF soe_account_deletion_private.count_or_remove_private_data(p_member,false)
      IS DISTINCT FROM soe_account_deletion_private.count_or_remove_private_data(NULL,false)
    OR cardinality(soe_account_deletion_private.circle_posts_for_member(p_member))<>0
    OR NOT soe_account_deletion_private.verify_circle_post_erasure(p_request)
    OR NOT soe_account_deletion_private.verify_contact_erasure(p_member)
    OR NOT soe_account_deletion_private.verify_circle_departure(p_member,hosted) THEN
    RAISE EXCEPTION 'Earlier erasure data changed and requires review' USING ERRCODE='PT409';
  END IF;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.preview_identity_removal(p_request uuid,p_member uuid,p_auth uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog SET row_security = off AS $$
DECLARE reviewed soe_account_deletion_private.processing%ROWTYPE;
  prior soe_account_deletion_private.identity_removals%ROWTYPE;
  current_auth uuid;
  current_wallet_hash bytea;
  provider_scope jsonb;
BEGIN
  SELECT * INTO reviewed FROM soe_account_deletion_private.processing
    WHERE request_id=p_request AND member_id IS NOT DISTINCT FROM p_member AND auth_user_id IS NOT DISTINCT FROM p_auth;
  IF NOT FOUND THEN RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE='PT409'; END IF;
  PERFORM soe_account_deletion_private.check_identity_removal_shape();
  PERFORM soe_account_deletion_private.check_identity_prerequisites(p_request,p_member);

  SELECT * INTO prior FROM soe_account_deletion_private.identity_removals WHERE request_id=p_request;
  IF p_member IS NOT NULL THEN
    SELECT m.supabase_auth_id,sha256(convert_to(lower(m.wallet_address),'UTF8')) INTO current_auth,current_wallet_hash
    FROM public.members AS m WHERE m.id=p_member;
    IF NOT FOUND AND prior.request_id IS NULL THEN
      RAISE EXCEPTION 'Member identity row requires review' USING ERRCODE='PT409';
    END IF;
  END IF;
  IF (prior.request_id IS NULL AND (current_auth IS DISTINCT FROM CASE WHEN p_member IS NULL THEN NULL::uuid ELSE p_auth END
      OR current_wallet_hash IS DISTINCT FROM reviewed.wallet_hash))
    OR (prior.request_id IS NOT NULL AND (current_auth IS NOT NULL OR current_wallet_hash IS NOT NULL))
    OR EXISTS (SELECT 1 FROM public.members WHERE supabase_auth_id=p_auth AND id IS DISTINCT FROM p_member) THEN
    RAISE EXCEPTION 'Member identity binding changed and requires review' USING ERRCODE='PT409';
  END IF;
  provider_scope:=soe_account_deletion_private.identity_provider_scope(p_auth);
  RETURN jsonb_build_object('phase',CASE WHEN prior.verified_at IS NOT NULL
      AND provider_scope=soe_account_deletion_private.identity_provider_scope(NULL) THEN 'verified'
      WHEN prior.request_id IS NOT NULL THEN 'prepared' ELSE 'review' END,
    'hasMember',p_member IS NOT NULL,'hasProvider',p_auth IS NOT NULL,'hasWallet',reviewed.wallet_hash IS NOT NULL,
    'provider',provider_scope);
END;
$$;

CREATE FUNCTION soe_account_deletion_private.prepare_identity_removal(
  p_request uuid,p_member uuid,p_auth uuid,p_reviewed_scope jsonb,p_approved boolean
) RETURNS timestamptz LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog SET lock_timeout = '3s' AS $$
DECLARE scope jsonb;
  prior soe_account_deletion_private.identity_removals%ROWTYPE;
  prepared timestamptz;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' OR p_approved IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Approve the exact identity removal in a read-committed transaction' USING ERRCODE='PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing WHERE request_id=p_request
    AND member_id IS NOT DISTINCT FROM p_member AND auth_user_id IS NOT DISTINCT FROM p_auth FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.members WHERE id=p_member FOR NO KEY UPDATE;
  scope:=soe_account_deletion_private.preview_identity_removal(p_request,p_member,p_auth);
  IF scope->'provider'->'ownedStorage'<>'{}'::jsonb OR scope->'provider'->'otherReferences'<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Resolve current provider ownership and references first' USING ERRCODE='PT409';
  END IF;
  SELECT * INTO prior FROM soe_account_deletion_private.identity_removals WHERE request_id=p_request;
  IF FOUND THEN
    IF prior.reviewed_scope IS DISTINCT FROM p_reviewed_scope THEN
      RAISE EXCEPTION 'Prepared identity removal requires the original review' USING ERRCODE='PT409';
    END IF;
    RETURN prior.prepared_at;
  END IF;
  IF scope IS DISTINCT FROM p_reviewed_scope THEN
    RAISE EXCEPTION 'Review current identity records first' USING ERRCODE='PT409';
  END IF;

  INSERT INTO soe_account_deletion_private.identity_removal_context VALUES (pg_current_xact_id(),p_request);
  UPDATE public.members SET supabase_auth_id=NULL,wallet_address=NULL WHERE id=p_member;
  DELETE FROM soe_account_deletion_private.identity_removal_context WHERE tx=pg_current_xact_id();
  prepared:=clock_timestamp();
  INSERT INTO soe_account_deletion_private.identity_removals(request_id,reviewed_scope,prepared_at)
    VALUES (p_request,scope,prepared);
  RETURN prepared;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.verify_identity_removal(p_request uuid,p_member uuid,p_auth uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog SET lock_timeout = '3s' AS $$
DECLARE scope jsonb;
  verified timestamptz;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Verify identity removal in a read-committed transaction' USING ERRCODE='PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing WHERE request_id=p_request
    AND member_id IS NOT DISTINCT FROM p_member AND auth_user_id IS NOT DISTINCT FROM p_auth FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE='PT409'; END IF;
  scope:=soe_account_deletion_private.preview_identity_removal(p_request,p_member,p_auth);
  IF scope->>'phase'='review' OR scope->'provider' IS DISTINCT FROM soe_account_deletion_private.identity_provider_scope(NULL) THEN
    RAISE EXCEPTION 'Provider identity removal is not yet verified' USING ERRCODE='PT409';
  END IF;
  UPDATE soe_account_deletion_private.identity_removals SET verified_at=coalesce(verified_at,clock_timestamp())
    WHERE request_id=p_request RETURNING verified_at INTO STRICT verified;
  RETURN verified;
END;
$$;

REVOKE ALL ON FUNCTION
  soe_account_deletion_private.check_identity_removal_shape(),
  soe_account_deletion_private.identity_provider_scope(uuid),
  soe_account_deletion_private.check_identity_prerequisites(uuid,uuid),
  soe_account_deletion_private.preview_identity_removal(uuid,uuid,uuid),
  soe_account_deletion_private.prepare_identity_removal(uuid,uuid,uuid,jsonb,boolean),
  soe_account_deletion_private.verify_identity_removal(uuid,uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;

DO $$
BEGIN
  PERFORM soe_account_deletion_private.check_identity_removal_shape();
  IF EXISTS (
    SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS r(role_name)
    WHERE pg_has_role(role_name,current_user,'MEMBER') OR EXISTS (
      SELECT 1 FROM (VALUES ('identity_removals'),('identity_removal_context')) AS t(name)
      WHERE has_table_privilege(r.role_name,'soe_account_deletion_private.'||t.name,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ) OR EXISTS (
      SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid=p.pronamespace
      WHERE n.nspname='soe_account_deletion_private'
        AND p.proname IN ('check_identity_removal_shape','identity_provider_scope','check_identity_prerequisites',
          'preview_identity_removal','prepare_identity_removal','verify_identity_removal')
        AND has_function_privilege(r.role_name,p.oid,'EXECUTE')
    )
  ) THEN RAISE EXCEPTION 'Unexpected identity removal privileges'; END IF;
END;
$$;

COMMIT;
