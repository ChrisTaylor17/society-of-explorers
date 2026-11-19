-- Owner review draft. Apply on an isolated restore after raw Twiddle
-- containment and the identity-removal draft. Archive the old app routes
-- before any hosted use. This phase operates only on SoE-owned tables.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE ONLY public.twiddles, ONLY public.twiddle_collaborators, ONLY public.twiddle_reactions
  IN ACCESS EXCLUSIVE MODE;

DO $archive$
DECLARE
  target regclass;
  columns_sql text;
BEGIN
  IF current_user <> 'postgres' OR NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'soe_account_deletion_private.check_identity_prerequisites(uuid,uuid)'::regprocedure
      AND proowner = current_user::regrole AND NOT prosecdef AND provolatile = 's'
      AND proconfig = ARRAY['search_path=pg_catalog']
      AND encode(sha256(convert_to(prosrc,'UTF8')),'hex') = '71156ba606e59c3335713996ee9786c05ab2dbf56c86b79472a66ed1b2a3b86c'
  ) THEN
    RAISE EXCEPTION 'The owner and identity-removal draft require review' USING ERRCODE = 'PT409';
  END IF;

  FOREACH target IN ARRAY ARRAY['public.twiddles'::regclass, 'public.twiddle_collaborators'::regclass,
    'public.twiddle_reactions'::regclass] LOOP
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns_sql
      FROM pg_attribute WHERE attrelid = target AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM service_role RESTRICT', target);
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE %s FROM service_role RESTRICT', columns_sql, target);
  END LOOP;
END
$archive$;

CREATE TABLE soe_account_deletion_private.twiddle_erasure_receipts (
  request_id uuid PRIMARY KEY REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT,
  reviewed_scope jsonb NOT NULL,
  anchor_digest text NOT NULL CHECK (length(anchor_digest) = 64),
  cleared_at timestamptz NOT NULL
);
CREATE TABLE soe_account_deletion_private.twiddle_erasure_targets (
  twiddle_id uuid PRIMARY KEY REFERENCES public.twiddles(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT
);
CREATE INDEX twiddle_erasure_targets_request ON soe_account_deletion_private.twiddle_erasure_targets(request_id,twiddle_id);
ALTER TABLE soe_account_deletion_private.twiddle_erasure_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_account_deletion_private.twiddle_erasure_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soe_account_deletion_private.twiddle_erasure_receipts,
  soe_account_deletion_private.twiddle_erasure_targets FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION soe_account_deletion_private.check_twiddle_erasure_shape()
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE
  targets constant regclass[] := ARRAY['public.twiddles'::regclass,
    'public.twiddle_collaborators'::regclass,'public.twiddle_reactions'::regclass];
BEGIN
  IF current_user <> 'postgres' OR EXISTS (
    SELECT 1 FROM pg_class AS c WHERE c.oid = ANY(targets)
      AND (c.relkind <> 'r' OR c.relispartition OR c.relowner <> current_user::regrole
        OR NOT c.relrowsecurity OR c.relforcerowsecurity)
  ) OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid = ANY(targets) OR inhparent = ANY(targets))
  OR EXISTS (
    SELECT 1 FROM pg_roles AS r CROSS JOIN unnest(targets) AS t(relation)
    WHERE r.rolname IN ('anon','authenticated','service_role')
      AND (r.rolsuper OR has_table_privilege(r.oid,t.relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(r.oid,t.relation,'SELECT,INSERT,UPDATE,REFERENCES')
        OR pg_has_role(r.oid,current_user::regrole,'MEMBER'))
  ) OR EXISTS (
    SELECT 1 FROM pg_publication_tables AS p WHERE to_regclass(format('%I.%I',p.schemaname,p.tablename)) = ANY(targets)
  ) OR EXISTS (
    SELECT 1 FROM pg_rewrite AS r WHERE r.ev_class = ANY(targets)
      OR EXISTS (SELECT 1 FROM pg_depend AS d WHERE d.classid = 'pg_rewrite'::regclass AND d.objid = r.oid
        AND d.refclassid = 'pg_class'::regclass AND d.refobjid = ANY(targets))
  ) OR EXISTS (
    SELECT 1 FROM pg_proc AS p CROSS JOIN pg_roles AS r
    WHERE p.prosecdef AND r.rolname IN ('anon','authenticated','service_role')
      AND has_schema_privilege(r.oid,p.pronamespace,'USAGE') AND has_function_privilege(r.oid,p.oid,'EXECUTE')
      AND (p.prosrc ~* '\m(twiddles|twiddle_collaborators|twiddle_reactions)\M'
        OR EXISTS (SELECT 1 FROM pg_depend AS d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid
          AND d.refclassid = 'pg_class'::regclass AND d.refobjid = ANY(targets)))
  ) THEN
    RAISE EXCEPTION 'Legacy Twiddle access must be closed before erasure' USING ERRCODE = 'PT409';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.twiddles'::regclass, ARRAY[
        'artifact_url:text','author_id:uuid','content:text','created_at:timestamp with time zone','exp_awarded:integer',
        'id:uuid!','is_thinker_response:boolean','is_woven:boolean','mintable:boolean','minted:boolean','nft_token_id:integer',
        'parent_id:uuid','root_id:uuid','sketch_data:jsonb','thinker_key:text','thinker_tags:text[]','thread_type:text',
        'twiddle_type:text','updated_at:timestamp with time zone','voice_url:text','woven_from:uuid[]']),
      ('public.twiddle_collaborators'::regclass, ARRAY[
        'contribution_type:text','created_at:timestamp with time zone','id:uuid!','twiddle_id:uuid','user_id:uuid']),
      ('public.twiddle_reactions'::regclass, ARRAY[
        'created_at:timestamp with time zone','id:uuid!','reaction_type:text','twiddle_id:uuid','user_id:uuid'])
    ) AS known(relation,columns)
    WHERE known.columns IS DISTINCT FROM (
      SELECT array_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||CASE WHEN a.attnotnull THEN '!' ELSE '' END
        ORDER BY a.attname COLLATE "C") FROM pg_attribute AS a
      WHERE a.attrelid=known.relation AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attidentity=''
    ) OR EXISTS (SELECT 1 FROM pg_attribute AS a WHERE a.attrelid=known.relation AND a.attnum>0 AND NOT a.attisdropped
      AND (a.attgenerated<>'' OR a.attidentity<>''))
  ) OR (
    SELECT array_agg(c.conrelid::regclass::text||':'||pg_get_constraintdef(c.oid)
      ORDER BY (c.conrelid::regclass::text||':'||pg_get_constraintdef(c.oid)) COLLATE "C")
    FROM pg_constraint AS c WHERE c.contype='f' AND (c.conrelid=ANY(targets) OR c.confrelid=ANY(targets))
  ) IS DISTINCT FROM ARRAY[
    'public.twiddle_collaborators:FOREIGN KEY (twiddle_id) REFERENCES public.twiddles(id) ON DELETE CASCADE',
    'public.twiddle_collaborators:FOREIGN KEY (user_id) REFERENCES auth.users(id)',
    'public.twiddle_reactions:FOREIGN KEY (twiddle_id) REFERENCES public.twiddles(id) ON DELETE CASCADE',
    'public.twiddle_reactions:FOREIGN KEY (user_id) REFERENCES auth.users(id)',
    'public.twiddles:FOREIGN KEY (author_id) REFERENCES auth.users(id)',
    'public.twiddles:FOREIGN KEY (parent_id) REFERENCES public.twiddles(id)',
    'public.twiddles:FOREIGN KEY (root_id) REFERENCES public.twiddles(id)',
    'soe_account_deletion_private.twiddle_erasure_targets:FOREIGN KEY (twiddle_id) REFERENCES public.twiddles(id) ON DELETE RESTRICT'
  ] OR (SELECT count(*) FROM pg_trigger AS t WHERE t.tgrelid=ANY(targets) AND NOT t.tgisinternal)<>1
  OR NOT EXISTS (
    SELECT 1 FROM pg_trigger AS t JOIN pg_proc AS f ON f.oid=t.tgfoid
    WHERE t.tgrelid='public.twiddles'::regclass AND t.tgname='twiddles_updated' AND t.tgtype=19 AND t.tgenabled='O'
      AND t.tgqual IS NULL AND t.tgnargs=0 AND cardinality(t.tgattr::smallint[])=0
      AND f.oid=to_regprocedure('public.update_twiddle_timestamp()') AND f.proowner=current_user::regrole
      AND NOT f.prosecdef AND f.proconfig IS NULL AND md5(f.prosrc)='301a884953d37769916294bb60562e05'
  ) THEN
    RAISE EXCEPTION 'Legacy Twiddle schema or dependencies require review' USING ERRCODE = 'PT409';
  END IF;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.twiddle_erasure_scope(p_request uuid,p_auth uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog SET TimeZone = 'UTC' AS $$
  WITH RECURSIVE authored AS (SELECT * FROM public.twiddles WHERE author_id=p_auth),
  collaborators AS (SELECT * FROM public.twiddle_collaborators WHERE user_id=p_auth),
  reactions AS (SELECT * FROM public.twiddle_reactions WHERE user_id=p_auth),
  media AS (SELECT id FROM authored WHERE nullif(btrim(voice_url),'') IS NOT NULL OR nullif(btrim(artifact_url),'') IS NOT NULL),
  minted AS (SELECT id FROM authored WHERE minted IS TRUE OR nft_token_id IS NOT NULL),
  affected_ids AS (
    SELECT id FROM authored
    UNION SELECT twiddle_id FROM soe_account_deletion_private.twiddle_erasure_targets WHERE request_id=p_request
  ), ancestors(id) AS (
    SELECT id FROM affected_ids
    UNION
    SELECT links.id FROM ancestors AS a JOIN public.twiddles AS t ON t.id=a.id
    CROSS JOIN LATERAL (VALUES (t.parent_id),(t.root_id)) AS links(id) WHERE links.id IS NOT NULL
  ),
  copies AS (
    SELECT t.* FROM public.twiddles AS t WHERE t.author_id IS DISTINCT FROM p_auth
      AND (t.woven_from && ARRAY(SELECT id FROM affected_ids) OR ((t.is_thinker_response IS TRUE OR t.thinker_key IS NOT NULL)
        AND (t.parent_id IN (SELECT id FROM ancestors) OR t.root_id IN (SELECT id FROM ancestors))))
  ), items(kind,row_data) AS (
    SELECT 'post',to_jsonb(t) FROM authored AS t
    UNION ALL SELECT 'collaborator',to_jsonb(t) FROM collaborators AS t
    UNION ALL SELECT 'reaction',to_jsonb(t) FROM reactions AS t
    UNION ALL SELECT 'copy',to_jsonb(t) FROM copies AS t
  ), digests AS (SELECT kind,encode(sha256(convert_to(row_data::text,'UTF8')),'hex') AS digest FROM items)
  SELECT jsonb_build_object('requestId',p_request,
    'counts',jsonb_build_object('posts',(SELECT count(*) FROM authored),
      'collaborators',(SELECT count(*) FROM collaborators),'reactions',(SELECT count(*) FROM reactions)),
    'blockers',jsonb_build_object('media',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM media),'[]'::jsonb),
      'minted',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM minted),'[]'::jsonb),
      'copies',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM copies),'[]'::jsonb)),
    'snapshot',encode(sha256(convert_to(coalesce(string_agg(kind||':'||digest,',' ORDER BY kind,digest),''),'UTF8')),'hex'))
  FROM digests;
$$;

CREATE FUNCTION soe_account_deletion_private.twiddle_anchor_digest(p_request uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog SET TimeZone = 'UTC' AS $$
  SELECT encode(sha256(convert_to(coalesce(string_agg(
    encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),',' ORDER BY t.id),''),'UTF8')),'hex')
  FROM soe_account_deletion_private.twiddle_erasure_targets AS target JOIN public.twiddles AS t ON t.id=target.twiddle_id
  WHERE target.request_id=p_request;
$$;

CREATE FUNCTION soe_account_deletion_private.verify_twiddle_erasure(p_request uuid,p_auth uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM soe_account_deletion_private.twiddle_erasure_receipts AS r
    WHERE r.request_id=p_request AND r.anchor_digest=soe_account_deletion_private.twiddle_anchor_digest(p_request)
      AND (r.reviewed_scope->'counts'->>'posts')::bigint =
        (SELECT count(*) FROM soe_account_deletion_private.twiddle_erasure_targets WHERE request_id=p_request))
    AND NOT EXISTS (SELECT 1 FROM public.twiddles WHERE author_id=p_auth)
    AND NOT EXISTS (SELECT 1 FROM public.twiddle_collaborators WHERE user_id=p_auth)
    AND NOT EXISTS (SELECT 1 FROM public.twiddle_reactions WHERE user_id=p_auth)
    AND soe_account_deletion_private.twiddle_erasure_scope(p_request,p_auth)->'blockers'->'copies'='[]'::jsonb;
$$;

CREATE FUNCTION soe_account_deletion_private.preview_twiddle_erasure(p_request uuid,p_member uuid,p_auth uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE original_scope jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM soe_account_deletion_private.processing WHERE request_id=p_request
    AND member_id IS NOT DISTINCT FROM p_member AND auth_user_id IS NOT DISTINCT FROM p_auth) THEN
    RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE = 'PT409';
  END IF;
  PERFORM soe_account_deletion_private.check_twiddle_erasure_shape();
  SELECT reviewed_scope INTO original_scope FROM soe_account_deletion_private.twiddle_erasure_receipts WHERE request_id=p_request;
  IF FOUND THEN
    IF NOT soe_account_deletion_private.verify_twiddle_erasure(p_request,p_auth) THEN
      RAISE EXCEPTION 'Cleared Twiddle records changed and require review' USING ERRCODE = 'PT409';
    END IF;
    RETURN original_scope;
  END IF;
  RETURN soe_account_deletion_private.twiddle_erasure_scope(p_request,p_auth);
END;
$$;

CREATE FUNCTION soe_account_deletion_private.erase_twiddle_data(
  p_request uuid,p_member uuid,p_auth uuid,p_reviewed_scope jsonb,p_approved boolean
) RETURNS timestamptz LANGUAGE plpgsql SET search_path = pg_catalog SET lock_timeout = '3s' AS $$
DECLARE
  scope jsonb;
  cleared timestamptz;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' OR p_approved IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Approve the exact Twiddle erasure in a read-committed transaction' USING ERRCODE = 'PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing WHERE request_id=p_request
    AND member_id IS NOT DISTINCT FROM p_member AND auth_user_id IS NOT DISTINCT FROM p_auth FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE = 'PT409'; END IF;
  LOCK TABLE public.twiddles,public.twiddle_collaborators,public.twiddle_reactions IN SHARE ROW EXCLUSIVE MODE;
  scope:=soe_account_deletion_private.preview_twiddle_erasure(p_request,p_member,p_auth);
  IF scope IS DISTINCT FROM p_reviewed_scope OR scope->'blockers' <> '{"media":[],"minted":[],"copies":[]}'::jsonb THEN
    RAISE EXCEPTION 'Review current Twiddle records and resolve linked copies, media or minted items' USING ERRCODE = 'PT409';
  END IF;
  SELECT cleared_at INTO cleared FROM soe_account_deletion_private.twiddle_erasure_receipts WHERE request_id=p_request;
  IF FOUND THEN RETURN cleared; END IF;

  WITH withdrawn AS (
    UPDATE public.twiddles SET author_id=NULL,content='Removed with account deletion.',twiddle_type='text',
      voice_url=NULL,artifact_url=NULL,sketch_data=NULL,thinker_tags=NULL,thinker_key=NULL,woven_from=NULL,
      mintable=false,is_thinker_response=false,is_woven=false
    WHERE author_id=p_auth RETURNING id
  )
  INSERT INTO soe_account_deletion_private.twiddle_erasure_targets(twiddle_id,request_id)
    SELECT id,p_request FROM withdrawn;
  DELETE FROM public.twiddle_collaborators WHERE user_id=p_auth;
  DELETE FROM public.twiddle_reactions WHERE user_id=p_auth;
  cleared:=clock_timestamp();
  INSERT INTO soe_account_deletion_private.twiddle_erasure_receipts(request_id,reviewed_scope,anchor_digest,cleared_at)
    VALUES (p_request,scope,soe_account_deletion_private.twiddle_anchor_digest(p_request),cleared);
  IF NOT soe_account_deletion_private.verify_twiddle_erasure(p_request,p_auth) THEN
    RAISE EXCEPTION 'Twiddle erasure could not be verified' USING ERRCODE = 'PT409';
  END IF;
  RETURN cleared;
END;
$$;

-- Keep the existing prerequisite function identity for already compiled callers.
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
END;
$$;

REVOKE ALL ON FUNCTION soe_account_deletion_private.check_twiddle_erasure_shape(),
  soe_account_deletion_private.twiddle_erasure_scope(uuid,uuid),soe_account_deletion_private.twiddle_anchor_digest(uuid),
  soe_account_deletion_private.verify_twiddle_erasure(uuid,uuid),soe_account_deletion_private.preview_twiddle_erasure(uuid,uuid,uuid),
  soe_account_deletion_private.erase_twiddle_data(uuid,uuid,uuid,jsonb,boolean),
  soe_account_deletion_private.check_identity_prerequisites(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

SELECT soe_account_deletion_private.check_twiddle_erasure_shape();
COMMIT;
