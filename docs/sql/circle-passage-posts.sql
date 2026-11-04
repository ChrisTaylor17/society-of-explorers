-- UNAPPLIED CANDIDATE DELTA. No production schema, data or grants were changed.
-- Requires the reviewed message moderation, participation and reading-program
-- candidates. Source quote/credits/locator are part of immutable message content;
-- this table retains only operation identity, not a second raw message body.
-- The server MUST derive canonical content from hash-verified local reader bytes.
-- SQL validates reference shape/pins/bounds; it cannot verify filesystem text.
-- Current primary documentation: SECURITY INVOKER, explicit role privileges,
-- grants separate from RLS, consistent row-lock ordering and short transactions.
-- https://supabase.com/docs/guides/database/functions
-- https://supabase.com/docs/guides/api/securing-your-api
-- https://www.postgresql.org/docs/17/explicit-locking.html
BEGIN;

DO $$ BEGIN
 IF to_regprocedure('public.soe_circle_messages_post(uuid,uuid,text,text)') IS NULL
  OR to_regprocedure('public._soe_circle_message_visibility(boolean,boolean)') IS NULL
  OR to_regprocedure('public._soe_circle_message_hash(text)') IS NULL
  OR to_regprocedure('public._soe_circle_reading_editions()') IS NULL
  OR to_regprocedure('public.soe_circle_membership_state(uuid,uuid)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND (rolbypassrls OR rolsuper)) THEN
  RAISE EXCEPTION 'Reviewed Circle prerequisites are unavailable';
 END IF;
END $$;

CREATE TABLE public.circle_passage_post_receipts (
 -- Retain the actor UUID as evidence without introducing an account-deletion
 -- constraint. Canonical authentication and current membership remain required.
 actor_member_id uuid NOT NULL,
 request_id uuid NOT NULL,
 cohort_id uuid NOT NULL REFERENCES public.book_cohorts(id) ON DELETE RESTRICT,
 message_id uuid NOT NULL UNIQUE REFERENCES public.seminar_messages(id) ON DELETE RESTRICT,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_member_id,request_id)
);
ALTER TABLE public.circle_passage_post_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.circle_passage_post_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.circle_passage_post_receipts TO service_role;

CREATE FUNCTION public._soe_circle_passage_receipt_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Post receipts are immutable';
END $$;
CREATE TRIGGER circle_passage_post_receipts_immutable BEFORE UPDATE OR DELETE ON public.circle_passage_post_receipts
 FOR EACH ROW EXECUTE FUNCTION public._soe_circle_passage_receipt_immutable();

CREATE FUNCTION public._soe_circle_passage_reference_valid(p_reference jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE blocks integer; block_index numeric; first_offset numeric; last_offset numeric;
BEGIN
 IF p_reference IS NULL OR jsonb_typeof(p_reference) IS DISTINCT FROM 'object' OR octet_length(p_reference::text)>2048 THEN RETURN false; END IF;
 IF NOT(p_reference ?& ARRAY['version','bookId','editionId','blockIndex','start','end'])
  OR p_reference-ARRAY['version','bookId','editionId','blockIndex','start','end']<>'{}'::jsonb
  OR p_reference->'version' IS DISTINCT FROM '1'::jsonb
  OR jsonb_typeof(p_reference->'bookId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_reference->'editionId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_reference->'blockIndex') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
 SELECT e.block_count INTO blocks FROM public._soe_circle_reading_editions() e
  WHERE e.book_id=p_reference->>'bookId' AND e.edition_id=p_reference->>'editionId';
 IF NOT FOUND THEN RETURN false; END IF;
 block_index:=(p_reference->>'blockIndex')::numeric;
 IF block_index<>trunc(block_index) OR block_index<0 OR block_index>=blocks THEN RETURN false; END IF;
 IF p_reference->'start'='null'::jsonb AND p_reference->'end'='null'::jsonb THEN RETURN true; END IF;
 IF jsonb_typeof(p_reference->'start') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_reference->'end') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
 first_offset:=(p_reference->>'start')::numeric; last_offset:=(p_reference->>'end')::numeric;
 RETURN first_offset=trunc(first_offset) AND last_offset=trunc(last_offset)
  AND first_offset>=0 AND last_offset>first_offset AND last_offset<=9007199254740991
  AND last_offset-first_offset<=600;
END $$;

-- PostgreSQL length counts Unicode codepoints. The browser contract uses UTF-16
-- units, so non-BMP characters consume two units in the full retained post.
CREATE FUNCTION public._soe_circle_passage_utf16_length(p_text text) RETURNS integer
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(sum(CASE WHEN ascii(ch)>65535 THEN 2 ELSE 1 END),0)::integer
 FROM regexp_split_to_table(p_text,'') ch;
$$;

-- All paths acquire cohort, then current membership, then message/state. Taking
-- UPDATE first for posts avoids upgrading a SHARE lock while another writer is
-- waiting. Existing leave/hide/withdraw operations use the same cohort boundary.
CREATE FUNCTION public._soe_circle_passage_require_access(p_actor uuid,p_circle_id uuid,p_write boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member access denied'; END IF;
 IF p_write THEN
  PERFORM 1 FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' AND NOT circle_hidden FOR UPDATE;
 ELSE
  PERFORM 1 FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' AND NOT circle_hidden FOR SHARE;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=p_circle_id AND member_id=p_actor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Current membership required'; END IF;
END $$;

CREATE FUNCTION public._soe_circle_passage_project(p_actor uuid,p_circle_id uuid,p_request_id uuid,p_message_id uuid,p_replayed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages; hidden boolean; withdrawn boolean;
BEGIN
 SELECT * INTO m FROM public.seminar_messages WHERE id=p_message_id AND cohort_id=p_circle_id AND member_id=p_actor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Post receipt unavailable'; END IF;
 SELECT coalesce(s.hidden,false),coalesce(s.withdrawn,false) INTO hidden,withdrawn
  FROM public.circle_message_states s WHERE s.message_id=m.id;
 hidden:=coalesce(hidden,false); withdrawn:=coalesce(withdrawn,false);
 RETURN jsonb_build_object('outcome','confirmed','circleId',p_circle_id,'requestId',p_request_id,'replayed',p_replayed,
  'message',jsonb_build_object('id',m.id,'member_name',public._soe_circle_message_name(m.member_name),
   'content',CASE WHEN hidden OR withdrawn THEN NULL ELSE m.content END,'created_at',m.created_at,
   'is_mine',true,'visibility',public._soe_circle_message_visibility(hidden,withdrawn)));
END $$;

CREATE FUNCTION public.soe_circle_passage_access(p_actor uuid,p_circle_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public._soe_circle_passage_require_access(p_actor,p_circle_id);
 RETURN jsonb_build_object('circleId',p_circle_id);
END $$;

CREATE FUNCTION public.soe_circle_passage_receipt(p_actor uuid,p_circle_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE prior public.circle_passage_post_receipts;
BEGIN
 PERFORM public._soe_circle_passage_require_access(p_actor,p_circle_id);
 IF p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='A request identifier is required'; END IF;
 SELECT * INTO prior FROM public.circle_passage_post_receipts WHERE actor_member_id=p_actor AND request_id=p_request_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF prior.cohort_id<>p_circle_id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request conflicts'; END IF;
 RETURN public._soe_circle_passage_project(p_actor,p_circle_id,p_request_id,prior.message_id,true);
END $$;

CREATE FUNCTION public.soe_circle_passage_post(p_actor uuid,p_circle_id uuid,p_request_id uuid,p_content text,p_reference jsonb,p_member_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE prior public.circle_passage_post_receipts; canonical text; identity_hash text; saved jsonb; message_id uuid;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member access denied'; END IF;
 IF p_request_id IS NULL OR p_content IS NULL OR length(p_content)>2000 OR length(btrim(p_content))=0
  OR p_content ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR public._soe_circle_passage_utf16_length(p_content)>2000
  OR NOT public._soe_circle_passage_reference_valid(p_reference) THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid passage post';
 END IF;
 canonical:=btrim(p_content);
 identity_hash:=public._soe_circle_message_hash(jsonb_build_object('circleId',p_circle_id,'content',canonical,'reference',p_reference)::text);
 PERFORM public._soe_circle_passage_require_access(p_actor,p_circle_id,true);
 SELECT * INTO prior FROM public.circle_passage_post_receipts WHERE actor_member_id=p_actor AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.cohort_id IS DISTINCT FROM p_circle_id OR prior.payload_hash IS DISTINCT FROM identity_hash THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request conflicts';
  END IF;
  RETURN public._soe_circle_passage_project(p_actor,p_circle_id,p_request_id,prior.message_id,true);
 END IF;
 -- The original insert rechecks current membership and the hidden-Circle gate.
 -- Completion does not block current-member wrap-up discussion.
 saved:=public.soe_circle_messages_post(p_actor,p_circle_id,canonical,p_member_name);
 message_id:=(saved->'message'->>'id')::uuid;
 IF message_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Post receipt unavailable'; END IF;
 BEGIN
  INSERT INTO public.circle_passage_post_receipts(actor_member_id,request_id,cohort_id,message_id,payload_hash)
   VALUES(p_actor,p_request_id,p_circle_id,message_id,identity_hash);
 EXCEPTION WHEN unique_violation THEN
  -- The same actor/key racing in another Circle must roll its new message back.
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request conflicts';
 END;
 RETURN public._soe_circle_passage_project(p_actor,p_circle_id,p_request_id,message_id,false);
END $$;

DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'soe_circle_passage_%' OR p.proname LIKE '_soe_circle_passage_%') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
 END LOOP;
END $$;
COMMIT;
