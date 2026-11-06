-- Owner-reviewed draft for an isolated restore. Apply after Twiddle erasure,
-- Waddle containment and the separately verified private Storage cutover.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE ONLY public.waddles IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE soe_account_deletion_private.waddle_erasure_receipts (
  request_id uuid PRIMARY KEY REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT,
  storage_origin text NOT NULL,
  scope_digest text NOT NULL CHECK (scope_digest ~ '^[0-9a-f]{64}$'),
  keys_digest bytea NOT NULL CHECK (octet_length(keys_digest)=32),
  pending_scope jsonb,
  prepared_at timestamptz NOT NULL,
  cleared_at timestamptz CHECK (cleared_at >= prepared_at),
  CHECK ((pending_scope IS NULL) = (cleared_at IS NOT NULL))
);
ALTER TABLE soe_account_deletion_private.waddle_erasure_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soe_account_deletion_private.waddle_erasure_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Share the account start lock with app writes. A frozen post may be hidden
-- with the exact two publication-field changes while the owner reviews it.
CREATE FUNCTION soe_account_deletion_private.guard_waddle_erasure_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE old_member uuid;
BEGIN
  PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE='PT503';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF to_jsonb(NEW)=to_jsonb(OLD)||'{"is_public":false,"public_consent_at":null}'::jsonb THEN
      RETURN NEW;
    END IF;
    old_member:=OLD.member_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM soe_account_deletion_private.processing AS p
    WHERE p.member_id IN (old_member,NEW.member_id)
      OR strpos(lower(NEW.audio_url),p.member_id::text)>0
  ) THEN
    RAISE EXCEPTION 'Account removal is in progress' USING ERRCODE='PT403';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER soe_guard_waddle_erasure_write BEFORE INSERT OR UPDATE ON public.waddles
FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_waddle_erasure_write();

CREATE FUNCTION soe_account_deletion_private.check_waddle_erasure_shape()
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog SET row_security = off AS $$
DECLARE target constant regclass := 'public.waddles'::regclass;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid=target AND relkind='r' AND relowner=current_user::regrole
      AND relrowsecurity AND NOT relforcerowsecurity AND NOT relispartition
  ) OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid=target OR inhparent=target)
    OR EXISTS (SELECT 1 FROM pg_rewrite rw WHERE rw.ev_class=target OR EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.classid='pg_rewrite'::regclass AND d.objid=rw.oid
        AND d.refclassid='pg_class'::regclass AND d.refobjid=target))
    OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname='public' AND tablename='waddles')
    OR EXISTS (
      SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')
        AND (has_table_privilege(r.oid,target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(r.oid,target,'SELECT,INSERT,UPDATE,REFERENCES'))
    )
    OR (SELECT array_agg(attname||':'||format_type(atttypid,atttypmod)||CASE WHEN attnotnull THEN '!' ELSE '' END
          ORDER BY attname COLLATE "C") FROM pg_attribute WHERE attrelid=target AND attnum>0 AND NOT attisdropped)
      IS DISTINCT FROM ARRAY['audio_url:text','created_at:timestamp with time zone','id:uuid!','is_public:boolean',
        'member_id:uuid','nft_token_id:text','public_consent_at:timestamp with time zone','thinker_id:text',
        'thinker_reaction:text','transcription:text']
    OR (SELECT array_agg(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid=target OR confrelid=target)
      IS DISTINCT FROM ARRAY['PRIMARY KEY (id)']
    OR NOT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid=target AND attname='public_consent_at' AND NOT attisdropped
        AND col_description(attrelid,attnum)='soe:waddle-public-consent:v1'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid=target AND tgname='soe_guard_waddle_erasure_write'
        AND tgtype=23 AND tgenabled='O'
        AND tgfoid='soe_account_deletion_private.guard_waddle_erasure_write()'::regprocedure
    ) OR EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid=target AND NOT tgisinternal AND tgname<>'soe_guard_waddle_erasure_write'
    )
  THEN
    RAISE EXCEPTION 'Waddle schema, write fence or access needs review' USING ERRCODE='PT409';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets b WHERE b.id='waddles' AND b.public IS FALSE
      AND coalesce(to_jsonb(b)->>'versioning_status','DISABLED')='DISABLED'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid='storage.objects'::regclass AND NOT attisdropped
      AND ((attname='owner' AND atttypid='uuid'::regtype)
        OR (attname='owner_id' AND atttypid IN ('text'::regtype,'varchar'::regtype)))
  ) THEN
    RAISE EXCEPTION 'Private unversioned Waddle Storage and ownership metadata require review' USING ERRCODE='PT409';
  END IF;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.waddle_erasure_audio_key(p_value text,p_member uuid,p_origin text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
  SELECT candidate
  FROM (VALUES (p_origin||'/storage/v1/object/public/waddles/')) AS legacy(prefix)
  CROSS JOIN LATERAL (VALUES (
    CASE WHEN starts_with(p_value,legacy.prefix) THEN substr(p_value,length(legacy.prefix)+1) ELSE p_value END
  )) AS normalized(candidate)
  WHERE candidate COLLATE "C" ~ (
    '^'||p_member::text||'/[0-9]{13}(-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?[.]webm$'
  );
$$;

-- The application uses the exact member UUID as its Storage folder. Include
-- orphan uploads there, even when the service upload has no provider owner.
CREATE FUNCTION soe_account_deletion_private.waddle_erasure_snapshot(p_member uuid,p_auth uuid,p_origin text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog SET row_security = off SET timezone = 'UTC' AS $$
  WITH posts AS (
    SELECT w.id,w.audio_url,w.nft_token_id,to_jsonb(w) AS row_state,
      soe_account_deletion_private.waddle_erasure_audio_key(w.audio_url,p_member,p_origin) AS key
    FROM public.waddles AS w WHERE w.member_id=p_member
  ), objects AS (
    SELECT o.name,to_jsonb(o)-'last_accessed_at' AS catalog_row
    FROM storage.objects AS o
    WHERE o.bucket_id='waddles' AND (
      starts_with(lower(o.name),p_member::text||'/') OR starts_with(lower(o.name),p_member::text||'%2f')
    )
  ), keys AS (
    SELECT key FROM posts WHERE key IS NOT NULL
    UNION
    SELECT name FROM objects
    WHERE soe_account_deletion_private.waddle_erasure_audio_key(name,p_member,p_origin)=name
  )
  SELECT jsonb_build_object(
    'storageOrigin',p_origin,
    'rowsDigest',encode(sha256(convert_to(
      coalesce((SELECT jsonb_agg(row_state ORDER BY id)::text FROM posts),'[]'),'UTF8')),'hex'),
    'rowCount',(SELECT count(*) FROM posts),
    'keys',coalesce((SELECT jsonb_agg(key ORDER BY key COLLATE "C") FROM keys),'[]'::jsonb),
    'objects',coalesce((SELECT jsonb_object_agg(name,encode(sha256(convert_to(catalog_row::text,'UTF8')),'hex'))
      FROM objects),'{}'::jsonb),
    'blockers',jsonb_build_object(
      'unresolvedRows',ARRAY(SELECT id FROM posts WHERE nullif(audio_url,'') IS NOT NULL AND key IS NULL ORDER BY id),
      'mintedRows',ARRAY(SELECT id FROM posts WHERE nullif(nft_token_id,'') IS NOT NULL ORDER BY id),
      'sharedRows',ARRAY(SELECT w.id FROM public.waddles AS w WHERE w.member_id IS DISTINCT FROM p_member
        AND strpos(lower(w.audio_url),p_member::text)>0 ORDER BY w.id),
      'unreviewedObjects',ARRAY(
        SELECT name FROM (
          SELECT name FROM objects
          WHERE soe_account_deletion_private.waddle_erasure_audio_key(name,p_member,p_origin) IS DISTINCT FROM name
            OR (catalog_row->>'owner' IS NOT NULL AND catalog_row->>'owner' IS DISTINCT FROM p_auth::text)
            OR (catalog_row->>'owner_id' IS NOT NULL AND catalog_row->>'owner_id' IS DISTINCT FROM p_auth::text)
            OR catalog_row->>'archived_at' IS NOT NULL OR catalog_row->>'is_versioned'='true'
            OR catalog_row->>'is_delete_marker'='true'
          UNION
          SELECT name FROM objects GROUP BY name HAVING count(*)<>1
        ) AS flagged ORDER BY name COLLATE "C"
      )
    )
  );
$$;

CREATE FUNCTION soe_account_deletion_private.verify_waddle_erasure(p_request uuid,p_member uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM soe_account_deletion_private.waddle_erasure_receipts AS r
    JOIN soe_account_deletion_private.processing AS p USING (request_id)
    WHERE r.request_id=p_request AND p.member_id IS NOT DISTINCT FROM p_member AND r.cleared_at IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM public.waddles AS w WHERE w.member_id=p_member OR strpos(lower(w.audio_url),p_member::text)>0
  ) AND NOT EXISTS (
    SELECT 1 FROM storage.objects AS o WHERE o.bucket_id='waddles'
      AND (starts_with(lower(o.name),p_member::text||'/') OR starts_with(lower(o.name),p_member::text||'%2f'))
  );
$$;

CREATE FUNCTION soe_account_deletion_private.preview_waddle_erasure(p_request uuid,p_member uuid,p_auth uuid,p_origin text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog SET row_security = off AS $$
DECLARE prior soe_account_deletion_private.waddle_erasure_receipts%ROWTYPE;
  scope jsonb;
BEGIN
  IF p_origin IS NULL OR p_origin COLLATE "C" !~ '^https://[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?[.][a-z]{2,63}$' THEN
    RAISE EXCEPTION 'Review the exact HTTPS Storage project origin' USING ERRCODE='PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing WHERE request_id=p_request
    AND member_id IS NOT DISTINCT FROM p_member AND auth_user_id IS NOT DISTINCT FROM p_auth;
  IF NOT FOUND THEN RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE='PT409'; END IF;
  PERFORM soe_account_deletion_private.check_waddle_erasure_shape();
  SELECT * INTO prior FROM soe_account_deletion_private.waddle_erasure_receipts WHERE request_id=p_request;
  IF FOUND AND prior.storage_origin IS DISTINCT FROM p_origin THEN
    RAISE EXCEPTION 'Use the prepared Waddle Storage project' USING ERRCODE='PT409';
  END IF;
  IF prior.cleared_at IS NOT NULL THEN
    IF NOT soe_account_deletion_private.verify_waddle_erasure(p_request,p_member) THEN
      RAISE EXCEPTION 'Cleared Waddle records need review' USING ERRCODE='PT409';
    END IF;
    RETURN jsonb_build_object('phase','cleared','scopeDigest',prior.scope_digest,'clearedAt',prior.cleared_at);
  END IF;

  scope:=soe_account_deletion_private.waddle_erasure_snapshot(p_member,p_auth,p_origin);
  IF prior.request_id IS NOT NULL THEN
    IF scope->'rowsDigest' IS DISTINCT FROM prior.pending_scope->'rowsDigest'
      OR scope->'blockers' IS DISTINCT FROM prior.pending_scope->'blockers'
      OR NOT ((scope->'objects') <@ (prior.pending_scope->'objects'))
    THEN
      RAISE EXCEPTION 'Waddle records or Storage changed after preparation' USING ERRCODE='PT409';
    END IF;
    RETURN jsonb_build_object('phase','storage','scopeDigest',prior.scope_digest,
      'storageOrigin',p_origin,'keys',prior.pending_scope->'keys','rowCount',scope->'rowCount',
      'remainingCatalogKeys',ARRAY(SELECT name FROM jsonb_object_keys(scope->'objects') AS keys(name) ORDER BY name COLLATE "C"),
      'catalogMissingAtPreparation',ARRAY(
        SELECT key FROM jsonb_array_elements_text(prior.pending_scope->'keys') AS manifest(key)
        WHERE NOT ((prior.pending_scope->'objects') ? key) ORDER BY key COLLATE "C"
      ));
  END IF;
  RETURN scope - 'rowsDigest' - 'objects' || jsonb_build_object(
    'phase','review','scopeDigest',encode(sha256(convert_to(scope::text,'UTF8')),'hex')
  );
END;
$$;

CREATE FUNCTION soe_account_deletion_private.prepare_waddle_erasure(
  p_request uuid,p_member uuid,p_auth uuid,p_origin text,p_scope_digest text,p_approved boolean
) RETURNS timestamptz LANGUAGE plpgsql SET search_path = pg_catalog SET lock_timeout = '3s' AS $$
DECLARE review jsonb;
  scope jsonb;
  hidden jsonb;
  prepared timestamptz;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' OR p_approved IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Approve the exact Waddle scope in a read-committed transaction' USING ERRCODE='PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing WHERE request_id=p_request
    AND member_id IS NOT DISTINCT FROM p_member AND auth_user_id IS NOT DISTINCT FROM p_auth FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE='PT409'; END IF;
  LOCK TABLE ONLY public.waddles IN SHARE ROW EXCLUSIVE MODE;
  review:=soe_account_deletion_private.preview_waddle_erasure(p_request,p_member,p_auth,p_origin);
  IF review->>'scopeDigest' IS DISTINCT FROM p_scope_digest THEN
    RAISE EXCEPTION 'Review the current Waddle scope first' USING ERRCODE='PT409';
  END IF;
  SELECT prepared_at INTO prepared FROM soe_account_deletion_private.waddle_erasure_receipts WHERE request_id=p_request;
  IF FOUND THEN RETURN prepared; END IF;
  IF review->'blockers'<>'{"unresolvedRows":[],"mintedRows":[],"sharedRows":[],"unreviewedObjects":[]}'::jsonb THEN
    RAISE EXCEPTION 'Resolve unresolved, shared or minted Waddle content and Storage first' USING ERRCODE='PT409';
  END IF;

  scope:=soe_account_deletion_private.waddle_erasure_snapshot(p_member,p_auth,p_origin);
  IF encode(sha256(convert_to(scope::text,'UTF8')),'hex') IS DISTINCT FROM p_scope_digest THEN
    RAISE EXCEPTION 'Waddle Storage changed during review' USING ERRCODE='PT409';
  END IF;
  UPDATE public.waddles SET is_public=false,public_consent_at=NULL WHERE member_id=p_member;
  hidden:=soe_account_deletion_private.waddle_erasure_snapshot(p_member,p_auth,p_origin);
  IF hidden-'rowsDigest' IS DISTINCT FROM scope-'rowsDigest' THEN
    RAISE EXCEPTION 'Waddle Storage changed during preparation' USING ERRCODE='PT409';
  END IF;

  prepared:=clock_timestamp();
  INSERT INTO soe_account_deletion_private.waddle_erasure_receipts(request_id,storage_origin,scope_digest,keys_digest,pending_scope,prepared_at)
  VALUES (p_request,p_origin,p_scope_digest,sha256(convert_to((scope->'keys')::text,'UTF8')),hidden,prepared);
  RETURN prepared;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.clear_waddle_erasure(
  p_request uuid,p_member uuid,p_auth uuid,p_scope_digest text,p_provider_absent_keys text[]
) RETURNS timestamptz LANGUAGE plpgsql SET search_path = pg_catalog SET lock_timeout = '3s' AS $$
DECLARE prior soe_account_deletion_private.waddle_erasure_receipts%ROWTYPE;
  review jsonb;
  cleared timestamptz;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Verify Waddle removal in a read-committed transaction' USING ERRCODE='PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing WHERE request_id=p_request
    AND member_id IS NOT DISTINCT FROM p_member AND auth_user_id IS NOT DISTINCT FROM p_auth FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE='PT409'; END IF;
  LOCK TABLE ONLY public.waddles IN SHARE ROW EXCLUSIVE MODE;
  PERFORM soe_account_deletion_private.check_waddle_erasure_shape();
  SELECT * INTO prior FROM soe_account_deletion_private.waddle_erasure_receipts WHERE request_id=p_request;
  IF NOT FOUND OR prior.scope_digest IS DISTINCT FROM p_scope_digest
    OR prior.keys_digest IS DISTINCT FROM sha256(convert_to(to_jsonb(p_provider_absent_keys)::text,'UTF8')) THEN
    RAISE EXCEPTION 'Review the exact prepared scope and Storage readback first' USING ERRCODE='PT409';
  END IF;
  IF prior.cleared_at IS NULL THEN
    review:=soe_account_deletion_private.preview_waddle_erasure(p_request,p_member,p_auth,prior.storage_origin);
    IF review->'remainingCatalogKeys'<>'[]'::jsonb THEN
      RAISE EXCEPTION 'Reviewed Waddle files are still present in the Storage catalog' USING ERRCODE='PT409';
    END IF;
    DELETE FROM public.waddles WHERE member_id=p_member;
    UPDATE soe_account_deletion_private.waddle_erasure_receipts SET pending_scope=NULL,cleared_at=clock_timestamp()
      WHERE request_id=p_request RETURNING cleared_at INTO STRICT cleared;
  ELSE
    cleared:=prior.cleared_at;
  END IF;
  IF NOT soe_account_deletion_private.verify_waddle_erasure(p_request,p_member) THEN
    RAISE EXCEPTION 'Waddle removal could not be verified' USING ERRCODE='PT409';
  END IF;
  RETURN cleared;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS p
    WHERE p.oid='soe_account_deletion_private.check_identity_prerequisites(uuid,uuid)'::regprocedure
      AND p.proowner=current_user::regrole AND NOT p.prosecdef AND p.provolatile='s'
      AND p.proconfig=ARRAY['search_path=pg_catalog']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='b77d8e0c53a197d7923b056d76b8b28ff5f5b3bd9ea063dc350a2ffac6620b6d'
  ) THEN
    RAISE EXCEPTION 'The earlier Twiddle identity check needs review' USING ERRCODE='PT409';
  END IF;
END;
$$;

-- Preserve the function identity and all of the earlier guards.
CREATE OR REPLACE FUNCTION soe_account_deletion_private.check_identity_prerequisites(p_request uuid,p_member uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE hosted uuid[];
  auth_subject uuid;
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

  SELECT auth_user_id INTO STRICT auth_subject FROM soe_account_deletion_private.processing
    WHERE request_id=p_request AND member_id IS NOT DISTINCT FROM p_member;
  PERFORM soe_account_deletion_private.check_twiddle_erasure_shape();
  IF NOT soe_account_deletion_private.verify_twiddle_erasure(p_request,auth_subject) THEN
    RAISE EXCEPTION 'Twiddle erasure requires verification' USING ERRCODE='PT409';
  END IF;

  PERFORM soe_account_deletion_private.check_waddle_erasure_shape();
  IF NOT soe_account_deletion_private.verify_waddle_erasure(p_request,p_member) THEN
    RAISE EXCEPTION 'Waddle erasure requires verification' USING ERRCODE='PT409';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION soe_account_deletion_private.guard_waddle_erasure_write(),
  soe_account_deletion_private.check_waddle_erasure_shape(),
  soe_account_deletion_private.waddle_erasure_audio_key(text,uuid,text),
  soe_account_deletion_private.waddle_erasure_snapshot(uuid,uuid,text),
  soe_account_deletion_private.verify_waddle_erasure(uuid,uuid),
  soe_account_deletion_private.preview_waddle_erasure(uuid,uuid,uuid,text),
  soe_account_deletion_private.prepare_waddle_erasure(uuid,uuid,uuid,text,text,boolean),
  soe_account_deletion_private.clear_waddle_erasure(uuid,uuid,uuid,text,text[]),
  soe_account_deletion_private.check_identity_prerequisites(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;

SELECT soe_account_deletion_private.check_waddle_erasure_shape();
COMMIT;
