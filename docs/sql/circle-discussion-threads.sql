-- UNAPPLIED CANDIDATE DELTA. Apply only after all reviewed Circle SQL, including
-- circle-passage-posts.sql. No existing function is replaced by this delta.
-- Reply links retain IDs, never a copy of parent text. Current membership and
-- current visibility gate EVERY archive, thread, target and receipt operation.
-- Pages are current per-call views, not one snapshot across multiple requests.
-- Cursor UUIDs resolve the database's full (created_at,id) tuple, including its
-- microseconds. Archive includes all posts; thread excludes its root and sorts
-- descendants oldest first. after=root explicitly means the first reply page.
-- https://supabase.com/docs/guides/database/functions
-- https://supabase.com/docs/guides/api/securing-your-api
-- https://www.postgresql.org/docs/17/explicit-locking.html
BEGIN;

DO $$ BEGIN
 IF to_regprocedure('public._soe_circle_passage_require_access(uuid,uuid,boolean)') IS NULL
 OR to_regprocedure('public._soe_circle_passage_utf16_length(text)') IS NULL
 OR to_regprocedure('public.soe_circle_messages_post(uuid,uuid,text,text)') IS NULL
 OR to_regprocedure('public._soe_circle_message_hash(text)') IS NULL
 OR to_regclass('public.circle_message_states') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND (rolbypassrls OR rolsuper)) THEN
  RAISE EXCEPTION 'Reviewed discussion prerequisites are unavailable';
 END IF;
END $$;

CREATE TABLE public.circle_message_reply_links (
 message_id uuid PRIMARY KEY REFERENCES public.seminar_messages(id) ON DELETE RESTRICT,
 cohort_id uuid NOT NULL REFERENCES public.book_cohorts(id) ON DELETE RESTRICT,
 parent_message_id uuid NOT NULL REFERENCES public.seminar_messages(id) ON DELETE RESTRICT,
 root_message_id uuid NOT NULL REFERENCES public.seminar_messages(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(message_id<>parent_message_id AND message_id<>root_message_id)
);
CREATE INDEX circle_message_reply_root ON public.circle_message_reply_links(cohort_id,root_message_id,message_id);
CREATE INDEX circle_message_reply_parent ON public.circle_message_reply_links(parent_message_id);
CREATE INDEX circle_discussion_archive ON public.seminar_messages(cohort_id,(coalesce(created_at,'-infinity'::timestamptz)) DESC,id DESC);

CREATE TABLE public.circle_discussion_post_receipts (
 -- UUID evidence deliberately has no members FK or account-deletion constraint.
 actor_member_id uuid NOT NULL,
 request_id uuid NOT NULL,
 cohort_id uuid NOT NULL REFERENCES public.book_cohorts(id) ON DELETE RESTRICT,
 message_id uuid NOT NULL UNIQUE REFERENCES public.seminar_messages(id) ON DELETE RESTRICT,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_member_id,request_id)
);
ALTER TABLE public.circle_message_reply_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_discussion_post_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.circle_message_reply_links,public.circle_discussion_post_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.circle_message_reply_links,public.circle_discussion_post_receipts TO service_role;

CREATE FUNCTION public._soe_circle_discussion_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Discussion identity is immutable';
END $$;
CREATE TRIGGER circle_reply_immutable BEFORE UPDATE OR DELETE ON public.circle_message_reply_links
 FOR EACH ROW EXECUTE FUNCTION public._soe_circle_discussion_immutable();
CREATE TRIGGER circle_discussion_receipt_immutable BEFORE UPDATE OR DELETE ON public.circle_discussion_post_receipts
 FOR EACH ROW EXECUTE FUNCTION public._soe_circle_discussion_immutable();

-- Defensive checks also apply to direct service inserts. Cohort first preserves
-- the existing mutation boundary. Roots already used by descendants cannot be
-- retroactively reparented, and a derived root cannot be the new child itself.
CREATE FUNCTION public._soe_circle_discussion_link_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE canonical_root uuid;
BEGIN
 PERFORM 1 FROM public.book_cohorts WHERE id=NEW.cohort_id AND book_id='soe-circles-path' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply identity conflicts'; END IF;
 PERFORM 1 FROM public.seminar_messages WHERE id=NEW.message_id AND cohort_id=NEW.cohort_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply identity conflicts'; END IF;
 PERFORM 1 FROM public.seminar_messages WHERE id=NEW.parent_message_id AND cohort_id=NEW.cohort_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply identity conflicts'; END IF;
 SELECT coalesce(l.root_message_id,NEW.parent_message_id) INTO canonical_root
 FROM (SELECT 1) seed LEFT JOIN public.circle_message_reply_links l ON l.message_id=NEW.parent_message_id;
 IF NEW.root_message_id IS DISTINCT FROM canonical_root OR NEW.message_id=canonical_root
 OR EXISTS(SELECT 1 FROM public.circle_message_reply_links WHERE message_id=canonical_root
  OR parent_message_id=NEW.message_id OR root_message_id=NEW.message_id) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply identity conflicts';
 END IF;
 PERFORM 1 FROM public.seminar_messages WHERE id=canonical_root AND cohort_id=NEW.cohort_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply identity conflicts'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER circle_reply_link_guard BEFORE INSERT ON public.circle_message_reply_links
 FOR EACH ROW EXECUTE FUNCTION public._soe_circle_discussion_link_guard();

-- Old salon schemas permit NULL timestamps and unrestricted body lengths.
-- Such retained rows remain navigable as explicit unavailable entries without
-- leaking malformed content or inventing a date. Held states take priority.
CREATE FUNCTION public._soe_circle_discussion_trim(p_content text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT btrim(p_content,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)
  ||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)
  ||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
$$;
CREATE FUNCTION public._soe_circle_discussion_available(p_content text,p_created_at timestamptz) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT p_created_at IS NOT NULL AND isfinite(p_created_at)
  AND extract(year FROM p_created_at AT TIME ZONE 'UTC') BETWEEN 1 AND 9999
  AND p_content IS NOT NULL AND length(public._soe_circle_discussion_trim(p_content))>0 AND length(p_content)<=2000
  AND p_content !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
  AND public._soe_circle_passage_utf16_length(p_content)<=2000;
$$;

CREATE FUNCTION public._soe_circle_discussion_project(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages; hidden boolean; withdrawn boolean; parent_id uuid; root_id uuid;
BEGIN
 SELECT * INTO m FROM public.seminar_messages WHERE id=p_message_id AND cohort_id=p_circle_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable'; END IF;
 SELECT coalesce(s.hidden,false),coalesce(s.withdrawn,false) INTO hidden,withdrawn
  FROM public.circle_message_states s WHERE s.message_id=m.id;
 hidden:=coalesce(hidden,false);withdrawn:=coalesce(withdrawn,false);
 SELECT parent_message_id,root_message_id INTO parent_id,root_id FROM public.circle_message_reply_links WHERE message_id=m.id;
 RETURN jsonb_build_object('id',m.id,'member_name',public._soe_circle_message_name(m.member_name),
  'content',CASE WHEN hidden OR withdrawn OR NOT public._soe_circle_discussion_available(m.content,m.created_at) THEN NULL ELSE m.content END,
  'created_at',CASE WHEN m.created_at IS NOT NULL AND isfinite(m.created_at)
   AND extract(year FROM m.created_at AT TIME ZONE 'UTC') BETWEEN 1 AND 9999 THEN m.created_at ELSE NULL END,
  'is_mine',coalesce(m.member_id=p_actor,false),
  'visibility',CASE WHEN NOT hidden AND NOT withdrawn AND NOT public._soe_circle_discussion_available(m.content,m.created_at)
   THEN 'unavailable' ELSE public._soe_circle_message_visibility(hidden,withdrawn) END,
  'parentMessageId',parent_id,'rootMessageId',coalesce(root_id,m.id));
END $$;

CREATE FUNCTION public._soe_circle_discussion_limit(p_limit integer) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>25 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid page size'; END IF;
END $$;

CREATE FUNCTION public.soe_circle_discussion_read(p_actor uuid,p_circle_id uuid,p_before uuid DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE anchor public.seminar_messages; row record; items jsonb:='[]'; n integer:=0; last_id uuid; more boolean:=false;
BEGIN
 PERFORM public._soe_circle_passage_require_access(p_actor,p_circle_id);
 PERFORM public._soe_circle_discussion_limit(p_limit);
 IF p_before IS NOT NULL THEN
  SELECT * INTO anchor FROM public.seminar_messages WHERE id=p_before AND cohort_id=p_circle_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid archive cursor'; END IF;
 END IF;
 FOR row IN SELECT m.id FROM public.seminar_messages m WHERE m.cohort_id=p_circle_id
  AND (p_before IS NULL OR (coalesce(m.created_at,'-infinity'::timestamptz),m.id)<(coalesce(anchor.created_at,'-infinity'::timestamptz),anchor.id))
  ORDER BY coalesce(m.created_at,'-infinity'::timestamptz) DESC,m.id DESC LIMIT p_limit+1 LOOP
  n:=n+1;
  IF n>p_limit THEN more:=true;EXIT;END IF;
  items:=items || jsonb_build_array(public._soe_circle_discussion_project(p_actor,p_circle_id,row.id));last_id:=row.id;
 END LOOP;
 RETURN jsonb_build_object('kind','archive','circleId',p_circle_id,'items',items,'nextCursor',CASE WHEN more THEN last_id ELSE NULL END,'limit',p_limit);
END $$;

CREATE FUNCTION public.soe_circle_discussion_thread(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE root_id uuid; anchor public.seminar_messages; row record; items jsonb:='[]'; n integer:=0; last_id uuid; more boolean:=false;
BEGIN
 PERFORM public._soe_circle_passage_require_access(p_actor,p_circle_id);
 PERFORM public._soe_circle_discussion_limit(p_limit);
 PERFORM 1 FROM public.seminar_messages WHERE id=p_message_id AND cohort_id=p_circle_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable'; END IF;
 SELECT coalesce(l.root_message_id,p_message_id) INTO root_id FROM (SELECT 1) seed
  LEFT JOIN public.circle_message_reply_links l ON l.message_id=p_message_id;
 IF p_after IS NOT NULL AND p_after<>root_id THEN
  SELECT m.* INTO anchor FROM public.seminar_messages m JOIN public.circle_message_reply_links l ON l.message_id=m.id
   WHERE m.id=p_after AND m.cohort_id=p_circle_id AND l.cohort_id=p_circle_id AND l.root_message_id=root_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid thread cursor'; END IF;
 END IF;
 FOR row IN SELECT m.id FROM public.seminar_messages m JOIN public.circle_message_reply_links l ON l.message_id=m.id
  WHERE m.cohort_id=p_circle_id AND l.cohort_id=p_circle_id AND l.root_message_id=root_id
  AND (p_after IS NULL OR p_after=root_id OR (coalesce(m.created_at,'-infinity'::timestamptz),m.id)>(coalesce(anchor.created_at,'-infinity'::timestamptz),anchor.id))
  ORDER BY coalesce(m.created_at,'-infinity'::timestamptz),m.id LIMIT p_limit+1 LOOP
  n:=n+1;
  IF n>p_limit THEN more:=true;EXIT;END IF;
  items:=items || jsonb_build_array(public._soe_circle_discussion_project(p_actor,p_circle_id,row.id));last_id:=row.id;
 END LOOP;
 RETURN jsonb_build_object('kind','thread','circleId',p_circle_id,
  'root',public._soe_circle_discussion_project(p_actor,p_circle_id,root_id),
  'focus',public._soe_circle_discussion_project(p_actor,p_circle_id,p_message_id),
  'items',items,'nextCursor',CASE WHEN more THEN last_id ELSE NULL END,'limit',p_limit);
END $$;

CREATE FUNCTION public.soe_circle_discussion_target(p_actor uuid,p_circle_id uuid,p_parent_message_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages; s public.circle_message_states;
BEGIN
 PERFORM public._soe_circle_passage_require_access(p_actor,p_circle_id);
 IF p_parent_message_id IS NULL THEN RETURN jsonb_build_object('circleId',p_circle_id,'target',NULL);END IF;
 SELECT * INTO m FROM public.seminar_messages WHERE id=p_parent_message_id AND cohort_id=p_circle_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable';END IF;
 SELECT * INTO s FROM public.circle_message_states WHERE message_id=m.id FOR SHARE;
 IF coalesce(s.hidden,false) OR coalesce(s.withdrawn,false) OR NOT public._soe_circle_discussion_available(m.content,m.created_at)
  THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply target unavailable';END IF;
 RETURN jsonb_build_object('circleId',p_circle_id,'target',jsonb_build_object(
  'message',public._soe_circle_discussion_project(p_actor,p_circle_id,m.id),'revision',coalesce(s.revision,0),
  'contentHash',public._soe_circle_message_hash(m.content)));
END $$;

CREATE FUNCTION public._soe_circle_discussion_receipt_project(p_actor uuid,p_circle_id uuid,p_request_id uuid,p_message_id uuid,p_replayed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.seminar_messages WHERE id=p_message_id AND cohort_id=p_circle_id AND member_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Post receipt unavailable';END IF;
 RETURN jsonb_build_object('outcome','confirmed','circleId',p_circle_id,'requestId',p_request_id,'replayed',p_replayed,
  'message',public._soe_circle_discussion_project(p_actor,p_circle_id,p_message_id));
END $$;

CREATE FUNCTION public.soe_circle_discussion_receipt(p_actor uuid,p_circle_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE prior public.circle_discussion_post_receipts;
BEGIN
 PERFORM public._soe_circle_passage_require_access(p_actor,p_circle_id);
 IF p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='A request identifier is required';END IF;
 SELECT * INTO prior FROM public.circle_discussion_post_receipts WHERE actor_member_id=p_actor AND request_id=p_request_id;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF prior.cohort_id<>p_circle_id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request conflicts';END IF;
 RETURN public._soe_circle_discussion_receipt_project(p_actor,p_circle_id,p_request_id,prior.message_id,true);
END $$;

CREATE FUNCTION public.soe_circle_discussion_post(p_actor uuid,p_circle_id uuid,p_request_id uuid,p_content text,
 p_parent_message_id uuid,p_expected_parent_revision bigint,p_expected_parent_hash text,p_member_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE prior public.circle_discussion_post_receipts; canonical text; identity_hash text; saved jsonb; message_id uuid;
 m public.seminar_messages; s public.circle_message_states; root_id uuid;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member access denied';END IF;
 IF p_request_id IS NULL OR p_content IS NULL OR length(p_content)>2000 OR length(public._soe_circle_discussion_trim(p_content))=0
 OR p_content ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' OR public._soe_circle_passage_utf16_length(p_content)>2000
 OR (p_parent_message_id IS NULL AND (p_expected_parent_revision IS NOT NULL OR p_expected_parent_hash IS NOT NULL))
 OR (p_parent_message_id IS NOT NULL AND (p_expected_parent_revision IS NULL OR p_expected_parent_revision<0
  OR p_expected_parent_revision>9007199254740991 OR p_expected_parent_hash IS NULL OR p_expected_parent_hash!~'^[0-9a-f]{64}$')) THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid discussion post';
 END IF;
 canonical:=public._soe_circle_discussion_trim(p_content);
 identity_hash:=public._soe_circle_message_hash(jsonb_build_object('circleId',p_circle_id,'content',canonical,
  'parentMessageId',p_parent_message_id,'expectedParentRevision',p_expected_parent_revision,'expectedParentHash',p_expected_parent_hash)::text);
 PERFORM public._soe_circle_passage_require_access(p_actor,p_circle_id,true);
 SELECT * INTO prior FROM public.circle_discussion_post_receipts WHERE actor_member_id=p_actor AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.cohort_id IS DISTINCT FROM p_circle_id OR prior.payload_hash IS DISTINCT FROM identity_hash THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request conflicts';END IF;
  -- Current message projection is authoritative; saved payload text is never
  -- returned. Parent may have been held after the original confirmed insert.
  RETURN public._soe_circle_discussion_receipt_project(p_actor,p_circle_id,p_request_id,prior.message_id,true);
 END IF;
 IF p_parent_message_id IS NOT NULL THEN
  SELECT * INTO m FROM public.seminar_messages WHERE id=p_parent_message_id AND cohort_id=p_circle_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply target unavailable';END IF;
  SELECT st.* INTO s FROM public.circle_message_states st WHERE st.message_id=m.id FOR SHARE;
  IF coalesce(s.hidden,false) OR coalesce(s.withdrawn,false) OR NOT public._soe_circle_discussion_available(m.content,m.created_at)
   OR coalesce(s.revision,0)<>p_expected_parent_revision
   OR public._soe_circle_message_hash(m.content)<>p_expected_parent_hash THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply target changed';END IF;
  SELECT coalesce(l.root_message_id,m.id) INTO root_id FROM (SELECT 1) seed
   LEFT JOIN public.circle_message_reply_links l ON l.message_id=m.id;
 END IF;
 saved:=public.soe_circle_messages_post(p_actor,p_circle_id,canonical,p_member_name);
 message_id:=(saved->'message'->>'id')::uuid;
 IF message_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Post receipt unavailable';END IF;
 IF p_parent_message_id IS NOT NULL THEN
  INSERT INTO public.circle_message_reply_links(message_id,cohort_id,parent_message_id,root_message_id)
   VALUES(message_id,p_circle_id,p_parent_message_id,root_id);
 END IF;
 BEGIN
  INSERT INTO public.circle_discussion_post_receipts(actor_member_id,request_id,cohort_id,message_id,payload_hash)
   VALUES(p_actor,p_request_id,p_circle_id,message_id,identity_hash);
 EXCEPTION WHEN unique_violation THEN
  -- A cross-Circle same-key race rolls the losing message AND link back.
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request conflicts';
 END;
 RETURN public._soe_circle_discussion_receipt_project(p_actor,p_circle_id,p_request_id,message_id,false);
END $$;

DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'soe_circle_discussion_%' OR p.proname LIKE '_soe_circle_discussion_%') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
 END LOOP;
END $$;
COMMIT;
