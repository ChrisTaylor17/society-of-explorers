-- Unapplied release draft. Stage after the Circle public profiles and
-- direct-message blocks drafts. Use the same private pair across both features.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE expected record;
  routine regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='soe_member_safety_private' AND n.nspowner=current_user::regrole
      AND c.relname='member_blocks' AND c.relowner=current_user::regrole
      AND c.relrowsecurity AND NOT c.relforcerowsecurity
  ) OR EXISTS (
    SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')
      AND (has_schema_privilege(r.oid,'soe_member_safety_private','USAGE,CREATE')
        OR has_table_privilege(r.oid,'soe_member_safety_private.member_blocks','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(r.oid,'soe_member_safety_private.member_blocks','SELECT,INSERT,UPDATE,REFERENCES'))
  ) THEN
    RAISE EXCEPTION 'Member block storage differs from the reviewed draft' USING ERRCODE='PT409';
  END IF;

  FOR expected IN SELECT * FROM (VALUES
    ('public._soe_circle_discussion_project(uuid,uuid,uuid)', '02987ba80aacc7c89b4fad7c7b0f3e531e43480111eaf8115520dfa7498f0db3'),
    ('public.soe_circle_discussion_target(uuid,uuid,uuid)', 'c4ef74cec963f4ee9d5a9e051859dae757332ad7307655792574a24731e14819'),
    ('public.soe_circle_discussion_post(uuid,uuid,uuid,text,uuid,bigint,text,text)', '835097dd2dcb0d267d94016a28eb4f368f7ee9114d88f499ef498e5eadf93153'),
    ('public.soe_circle_message_state(uuid,uuid,uuid)', '212de62ecc506fb6f523905e629fa25ccfe185d1304c18c3a7a49b14865aca97'),
    ('public.soe_circle_message_action(uuid,uuid,uuid,bigint,text,uuid,text,text,text)', '46c99bf3ca0e14bcb08a7c3d200260af1903b75ecaa6cc46ea75a1ab36e2c368'),
    ('public.soe_circle_messages_read(uuid,uuid)', 'ebcf4e13fa1cc1436aa93fcc806631dc9b18c761b29831a21d091e2f13a62e05'),
    ('public.soe_direct_message_set_block(uuid,uuid,uuid,boolean,bigint,uuid)', '180fd3358edbe8b0995b99011ff595bcadf2bde58fc0ccd20dec71a9065a864e'),
    ('soe_member_safety_private.lock_pair(uuid,uuid)', '32cdecd68bc23e5d17f5c34da2cce52bb8e197bd76146806f2b64cc2d489ed66'),
    ('soe_member_safety_private.contact_blocked(uuid,uuid)', '582d1cccd10b8fd42986e6560b95649ce18e988df082129851d8032ff3c843a6')
  ) AS inputs(signature,source_sha) LOOP
    routine:=to_regprocedure(expected.signature);
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid=routine AND p.proowner=current_user::regrole
        AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=expected.source_sha
        AND p.prosecdef=(p.proname='soe_direct_message_set_block')
        AND p.proconfig=CASE
          WHEN p.proname='soe_direct_message_set_block' THEN ARRAY['search_path=pg_catalog','row_security=off','lock_timeout=3s']
          WHEN p.pronamespace='soe_member_safety_private'::regnamespace THEN ARRAY['search_path=pg_catalog']
          ELSE ARRAY['search_path=pg_catalog, public'] END
        AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
        AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
        AND has_function_privilege('service_role',p.oid,'EXECUTE')=(p.pronamespace='public'::regnamespace)
    ) THEN
      RAISE EXCEPTION 'Review prior routine % before adding Circle blocks',expected.signature USING ERRCODE='PT409';
    END IF;
  END LOOP;
END;
$$;

-- Only bounded pair checks are callable by the app's service role. The block
-- table stays private. SECURITY DEFINER here uses the verified table owner.
ALTER FUNCTION soe_member_safety_private.contact_blocked(uuid,uuid) SECURITY DEFINER;
ALTER FUNCTION soe_member_safety_private.contact_blocked(uuid,uuid) SET row_security = off;

CREATE FUNCTION soe_member_safety_private.own_block_revision(p_actor uuid,p_peer uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog SET row_security = off AS $$
  SELECT coalesce((
    SELECT revision FROM soe_member_safety_private.member_blocks
    WHERE actor_id=p_actor AND peer_id=p_peer
  ),0);
$$;
REVOKE ALL ON FUNCTION soe_member_safety_private.own_block_revision(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA soe_member_safety_private TO service_role;
GRANT EXECUTE ON FUNCTION soe_member_safety_private.lock_pair(uuid,uuid),
  soe_member_safety_private.contact_blocked(uuid,uuid),soe_member_safety_private.own_block_revision(uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public._soe_circle_discussion_project(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages; hidden boolean; withdrawn boolean; parent_id uuid; root_id uuid;
BEGIN
 SELECT * INTO m FROM public.seminar_messages WHERE id=p_message_id AND cohort_id=p_circle_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable'; END IF;
 SELECT coalesce(s.hidden,false),coalesce(s.withdrawn,false) INTO hidden,withdrawn
  FROM public.circle_message_states s WHERE s.message_id=m.id;
 hidden:=coalesce(hidden,false);withdrawn:=coalesce(withdrawn,false);
 SELECT parent_message_id,root_message_id INTO parent_id,root_id FROM public.circle_message_reply_links WHERE message_id=m.id;
 IF soe_member_safety_private.contact_blocked(p_actor,m.member_id) THEN
  RETURN jsonb_build_object('id',m.id,'member_name','Explorer','content',NULL,'created_at',NULL,
   'is_mine',false,'visibility','unavailable','parentMessageId',parent_id,'rootMessageId',coalesce(root_id,m.id));
 END IF;
 RETURN jsonb_build_object('id',m.id,'member_name',public._soe_circle_message_name(m.member_name),
  'content',CASE WHEN hidden OR withdrawn OR NOT public._soe_circle_discussion_available(m.content,m.created_at) THEN NULL ELSE m.content END,
  'created_at',CASE WHEN m.created_at IS NOT NULL AND isfinite(m.created_at)
   AND extract(year FROM m.created_at AT TIME ZONE 'UTC') BETWEEN 1 AND 9999 THEN m.created_at ELSE NULL END,
  'is_mine',coalesce(m.member_id=p_actor,false),
  'visibility',CASE WHEN NOT hidden AND NOT withdrawn AND NOT public._soe_circle_discussion_available(m.content,m.created_at)
   THEN 'unavailable' ELSE public._soe_circle_message_visibility(hidden,withdrawn) END,
  'parentMessageId',parent_id,'rootMessageId',coalesce(root_id,m.id));
END $$;

CREATE OR REPLACE FUNCTION public.soe_circle_discussion_target(p_actor uuid,p_circle_id uuid,p_parent_message_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages; s public.circle_message_states;
BEGIN
 PERFORM public._soe_circle_passage_require_access(p_actor,p_circle_id);
 IF p_parent_message_id IS NULL THEN RETURN jsonb_build_object('circleId',p_circle_id,'target',NULL);END IF;
 SELECT * INTO m FROM public.seminar_messages WHERE id=p_parent_message_id AND cohort_id=p_circle_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable';END IF;
 IF m.member_id IS NOT NULL AND m.member_id<>p_actor THEN
  PERFORM soe_member_safety_private.lock_pair(p_actor,m.member_id);
  IF soe_member_safety_private.contact_blocked(p_actor,m.member_id) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply target unavailable';
  END IF;
 END IF;
 SELECT * INTO s FROM public.circle_message_states WHERE message_id=m.id FOR SHARE;
 IF coalesce(s.hidden,false) OR coalesce(s.withdrawn,false) OR NOT public._soe_circle_discussion_available(m.content,m.created_at)
  THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply target unavailable';END IF;
 RETURN jsonb_build_object('circleId',p_circle_id,'target',jsonb_build_object(
  'message',public._soe_circle_discussion_project(p_actor,p_circle_id,m.id),'revision',coalesce(s.revision,0),
  'contentHash',public._soe_circle_message_hash(m.content)));
END $$;

CREATE OR REPLACE FUNCTION public.soe_circle_discussion_post(p_actor uuid,p_circle_id uuid,p_request_id uuid,p_content text,
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
  IF m.member_id IS NOT NULL AND m.member_id<>p_actor THEN
   PERFORM soe_member_safety_private.lock_pair(p_actor,m.member_id);
   IF soe_member_safety_private.contact_blocked(p_actor,m.member_id) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reply target unavailable';
   END IF;
  END IF;
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

CREATE OR REPLACE FUNCTION public.soe_circle_message_state(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages; h boolean; state jsonb; block_revision bigint;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member access denied'; END IF;
  SELECT circle_hidden INTO h FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable'; END IF;
  SELECT * INTO m FROM public.seminar_messages WHERE id=p_message_id AND cohort_id=p_circle_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable'; END IF;
  IF m.member_id IS DISTINCT FROM p_actor THEN
    PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=p_circle_id AND member_id=p_actor FOR SHARE;
    IF h OR NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Post unavailable'; END IF;
  END IF;
  IF m.member_id IS NOT NULL AND m.member_id<>p_actor THEN
    PERFORM soe_member_safety_private.lock_pair(p_actor,m.member_id);
    IF soe_member_safety_private.contact_blocked(p_actor,m.member_id) THEN
      RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable';
    END IF;
  END IF;
  state:=public._soe_circle_message_project(p_actor,p_circle_id,p_message_id);
  IF m.member_id IS NOT NULL AND m.member_id<>p_actor AND state->'message'->>'visibility'='visible'
    AND public._soe_circle_discussion_available(m.content,m.created_at) THEN
    block_revision:=soe_member_safety_private.own_block_revision(p_actor,m.member_id);
    IF block_revision<9007199254740991 THEN
      state:=state||jsonb_build_object('blockReview',jsonb_build_object('memberId',p_actor,'revision',block_revision));
    END IF;
  END IF;
  RETURN state;
END $$;

CREATE OR REPLACE FUNCTION public.soe_circle_message_action(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_expected_revision bigint,p_content_hash text,p_request_id uuid,p_action text,p_reason text DEFAULT NULL,p_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages; s public.circle_message_states; prior public.circle_message_receipts; payload jsonb; result jsonb; h boolean;
BEGIN
  m:=public._soe_circle_message_lock(p_actor,p_circle_id,p_message_id);
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 OR p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$'
    OR p_action IS NULL OR p_action NOT IN ('report','withdraw') OR (p_action='withdraw' AND (p_reason IS NOT NULL OR p_note IS NOT NULL))
    OR (p_action='report' AND (p_reason IS NULL OR p_reason NOT IN ('safety','harassment','spam','misleading','inappropriate','other') OR length(p_note)>1000)) THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid post action'; END IF;
  IF p_action='withdraw' THEN
    IF m.member_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Only the author can withdraw this post'; END IF;
  ELSE
    SELECT circle_hidden INTO h FROM public.book_cohorts WHERE id=p_circle_id;
    PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=p_circle_id AND member_id=p_actor FOR SHARE;
    IF h OR NOT FOUND OR m.member_id=p_actor THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Reporting is unavailable'; END IF;
    IF m.member_id IS NOT NULL THEN
      PERFORM soe_member_safety_private.lock_pair(p_actor,m.member_id);
      IF soe_member_safety_private.contact_blocked(p_actor,m.member_id) THEN
        RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable';
      END IF;
    END IF;
  END IF;
  payload:=jsonb_build_object('circleId',p_circle_id,'messageId',p_message_id,'expectedRevision',p_expected_revision,'contentHash',p_content_hash,'action',p_action,'reason',p_reason,'note',p_note);
  SELECT * INTO prior FROM public.circle_message_receipts WHERE actor_member_id=p_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request conflicts'; END IF;
    RETURN prior.result || jsonb_build_object('state',public._soe_circle_message_project(p_actor,p_circle_id,p_message_id),'replayed',true);
  END IF;
  SELECT * INTO s FROM public.circle_message_states WHERE message_id=p_message_id;
  IF coalesce(s.revision,0)<>p_expected_revision OR p_content_hash<>public._soe_circle_message_hash(m.content) OR coalesce(s.revision,0)>=9007199254740991 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Post snapshot changed'; END IF;
  IF p_action='report' AND (coalesce(s.hidden,false) OR coalesce(s.withdrawn,false)) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Post is no longer visible'; END IF;
  IF p_action='withdraw' OR NOT EXISTS(SELECT 1 FROM public.circle_message_reports WHERE message_id=p_message_id AND reporter_member_id=p_actor AND status='open' AND reason=p_reason AND note IS NOT DISTINCT FROM p_note) THEN
    INSERT INTO public.circle_message_states(message_id,cohort_id) VALUES(p_message_id,p_circle_id) ON CONFLICT(message_id) DO NOTHING;
    IF p_action='withdraw' THEN
      UPDATE public.circle_message_states SET withdrawn=true,revision=revision+1 WHERE message_id=p_message_id AND NOT withdrawn;
    ELSE
      INSERT INTO public.circle_message_reports(cohort_id,message_id,reporter_member_id,reason,note) VALUES(p_circle_id,p_message_id,p_actor,p_reason,p_note);
      UPDATE public.circle_message_states SET revision=revision+1 WHERE message_id=p_message_id;
    END IF;
  END IF;
  result:=jsonb_build_object('requestId',p_request_id,'circleId',p_circle_id,'messageId',p_message_id)||CASE WHEN p_action='report' THEN jsonb_build_object('received',true) ELSE jsonb_build_object('withdrawn',true) END;
  BEGIN
    INSERT INTO public.circle_message_receipts(actor_member_id,request_id,payload,result) VALUES(p_actor,p_request_id,payload,result);
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request conflicts'; END;
  RETURN result || jsonb_build_object('state',public._soe_circle_message_project(p_actor,p_circle_id,p_message_id),'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.soe_circle_messages_read(p_actor uuid,p_circle_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE cohort jsonb; members jsonb; messages jsonb; truncated boolean;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member access denied'; END IF;
 SELECT jsonb_build_object('id',id,'book_id',book_id,'title',title,'description',description,'max_members',max_members,'start_date',start_date,'thinker_id',thinker_id,'status',status,'created_at',created_at) INTO cohort FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' AND NOT circle_hidden FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=p_circle_id AND member_id=p_actor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Current membership required'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'members',jsonb_build_object('display_name',m.display_name)) ORDER BY x.joined_at,x.id),'[]'::jsonb) INTO members FROM public.book_cohort_members x LEFT JOIN public.members m ON m.id=x.member_id WHERE x.cohort_id=p_circle_id;
 WITH page AS(SELECT m.*,coalesce(s.hidden,false) AS hidden,coalesce(s.withdrawn,false) AS withdrawn FROM public.seminar_messages m LEFT JOIN public.circle_message_states s ON s.message_id=m.id WHERE m.cohort_id=p_circle_id
   AND NOT soe_member_safety_private.contact_blocked(p_actor,m.member_id) ORDER BY m.created_at DESC,m.id DESC LIMIT 101),shown AS(SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT 100)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'member_name',public._soe_circle_message_name(member_name),'content',CASE WHEN withdrawn THEN '[Post withdrawn by its author.]' WHEN hidden THEN '[Post hidden after human review.]' ELSE content END,'created_at',created_at,'is_mine',coalesce(member_id=p_actor,false),'visibility',public._soe_circle_message_visibility(hidden,withdrawn)) ORDER BY created_at,id),'[]'::jsonb),(SELECT count(*)>100 FROM page) INTO messages,truncated FROM shown;
 RETURN jsonb_build_object('cohort',cohort,'members',members,'messages',messages,'history',jsonb_build_object('truncated',truncated,'limit',100));
END $$;

-- Derive the peer from the reviewed post. The scoped key keeps a retry for one
-- post from confirming a different post by the same person. An exact retry
-- may recover its receipt after the post is hidden or the pair is blocked.
CREATE FUNCTION public.soe_circle_message_block(
  p_actor uuid,p_circle_id uuid,p_message_id uuid,p_expected_revision bigint,p_content_hash text,
  p_expected_block_revision bigint,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off SET lock_timeout = '3s' AS $$
DECLARE m public.seminar_messages;
  s public.circle_message_states;
  scoped_request uuid;
  receipt jsonb;
BEGIN
  IF p_request_id IS NULL OR p_message_id IS NULL OR p_expected_revision IS NULL
    OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991
    OR p_expected_block_revision IS NULL OR p_expected_block_revision NOT BETWEEN 0 AND 9007199254740990
    OR p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Use a valid block review';
  END IF;

  PERFORM public._soe_circle_passage_require_access(p_actor,p_circle_id,true);
  SELECT * INTO m FROM public.seminar_messages
    WHERE id=p_message_id AND cohort_id=p_circle_id FOR SHARE;
  IF NOT FOUND OR m.member_id IS NULL OR m.member_id=p_actor THEN
    RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable';
  END IF;
  PERFORM soe_member_safety_private.lock_pair(p_actor,m.member_id);
  scoped_request:=left(public._soe_circle_message_hash(jsonb_build_array(
    'soe-circle-block',p_circle_id,p_message_id,p_expected_revision,p_content_hash,
    p_expected_block_revision,p_request_id)::text),32)::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM soe_member_safety_private.member_blocks
    WHERE actor_id=p_actor AND peer_id=m.member_id AND blocked AND last_request_id=scoped_request
  ) THEN
    IF soe_member_safety_private.contact_blocked(p_actor,m.member_id) THEN
      RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable';
    END IF;
    SELECT * INTO s FROM public.circle_message_states WHERE message_id=m.id FOR SHARE;
    IF coalesce(s.hidden,false) OR coalesce(s.withdrawn,false)
      OR NOT public._soe_circle_discussion_available(m.content,m.created_at)
      OR coalesce(s.revision,0)<>p_expected_revision
      OR public._soe_circle_message_hash(m.content) IS DISTINCT FROM p_content_hash THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Post snapshot changed';
    END IF;
  END IF;

  receipt:=public.soe_direct_message_set_block(p_actor,m.member_id,NULL,true,p_expected_block_revision,scoped_request);
  RETURN receipt||jsonb_build_object('requestId',p_request_id,'circleId',p_circle_id,'messageId',p_message_id);
END;
$$;

REVOKE ALL ON FUNCTION public.soe_circle_message_block(uuid,uuid,uuid,bigint,text,bigint,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.soe_circle_message_block(uuid,uuid,uuid,bigint,text,bigint,uuid)
  TO service_role;
COMMIT;
