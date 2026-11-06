-- Unapplied release draft. Stage after the direct-message containment draft
-- and deploy with the routes that call these service-only functions.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE ONLY public.direct_messages IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE dm constant regclass := 'public.direct_messages'::regclass;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid=dm AND relkind='r' AND relowner=current_user::regrole
      AND relrowsecurity AND NOT relforcerowsecurity AND NOT relispartition
  ) OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid=dm OR inhparent=dm)
    OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=dm AND polname='dm_open')
    OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname='public' AND tablename='direct_messages')
    OR EXISTS (
      SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')
        AND (r.rolsuper OR r.rolbypassrls
          OR has_table_privilege(r.oid,dm,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(r.oid,dm,'SELECT,INSERT,UPDATE,REFERENCES'))
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper
    ) THEN
    RAISE EXCEPTION 'Contain direct-message access before installing member blocks' USING ERRCODE='PT409';
  END IF;
END;
$$;

CREATE SCHEMA soe_member_safety_private;
REVOKE ALL ON SCHEMA soe_member_safety_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE soe_member_safety_private.member_blocks (
  actor_id uuid NOT NULL,
  peer_id uuid NOT NULL,
  block_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  blocked boolean NOT NULL,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  last_request_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (actor_id,peer_id),
  CHECK (actor_id<>peer_id)
);
ALTER TABLE soe_member_safety_private.member_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soe_member_safety_private.member_blocks FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION soe_member_safety_private.lock_pair(p_actor uuid,p_peer uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF p_actor IS NULL OR p_peer IS NULL OR current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Use an exact pair in a read-committed transaction' USING ERRCODE='PT400';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'soe-member-contact:'||least(p_actor,p_peer)::text||':'||greatest(p_actor,p_peer)::text,0));
END;
$$;

CREATE FUNCTION soe_member_safety_private.contact_blocked(p_actor uuid,p_peer uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM soe_member_safety_private.member_blocks
    WHERE blocked AND ((actor_id=p_actor AND peer_id=p_peer) OR (actor_id=p_peer AND peer_id=p_actor))
  );
$$;

CREATE FUNCTION public.soe_direct_message_read(p_actor uuid,p_peer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog SET row_security = off AS $$
DECLARE own soe_member_safety_private.member_blocks%ROWTYPE;
  available boolean;
  thread jsonb;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Member access required' USING ERRCODE='PT403'; END IF;
  IF p_peer IS NULL THEN
    RETURN jsonb_build_object('unreadCount',(
      SELECT count(*) FROM public.direct_messages AS m
      WHERE m.recipient_id=p_actor AND m.read IS FALSE
        AND NOT soe_member_safety_private.contact_blocked(p_actor,m.sender_id)
    ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id=p_peer) THEN
    RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT404';
  END IF;
  SELECT * INTO own FROM soe_member_safety_private.member_blocks WHERE actor_id=p_actor AND peer_id=p_peer;
  available:=NOT soe_member_safety_private.contact_blocked(p_actor,p_peer);
  IF available THEN
    SELECT jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_id,'recipient_id',m.recipient_id,
      'content',coalesce(m.content,''),'created_at',m.created_at,'read',m.read) ORDER BY m.created_at,m.id)
    INTO thread FROM public.direct_messages AS m
    WHERE (m.sender_id=p_actor AND m.recipient_id=p_peer) OR (m.sender_id=p_peer AND m.recipient_id=p_actor);
  END IF;
  RETURN jsonb_build_object('messages',coalesce(thread,'[]'::jsonb),'contact',jsonb_build_object(
    'blockId',own.block_id,'blockedByMe',coalesce(own.blocked,false),
    'revision',coalesce(own.revision,0),'canMessage',available
  ));
END;
$$;

CREATE FUNCTION public.soe_direct_message_send(p_actor uuid,p_peer uuid,p_content text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog SET row_security = off SET lock_timeout = '3s' AS $$
BEGIN
  PERFORM soe_member_safety_private.lock_pair(p_actor,p_peer);
  IF p_content IS NULL OR length(btrim(p_content))=0 OR length(p_content)>4000 THEN
    RAISE EXCEPTION 'Use a valid message' USING ERRCODE='PT400';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id=p_peer) THEN
    RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT404';
  END IF;
  IF soe_member_safety_private.contact_blocked(p_actor,p_peer) THEN
    RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT403';
  END IF;
  INSERT INTO public.direct_messages(sender_id,recipient_id,content) VALUES (p_actor,p_peer,p_content);
  RETURN '{"ok":true}'::jsonb;
END;
$$;

CREATE FUNCTION public.soe_direct_message_ack(p_actor uuid,p_peer uuid,p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog SET row_security = off SET lock_timeout = '3s' AS $$
BEGIN
  PERFORM soe_member_safety_private.lock_pair(p_actor,p_peer);
  IF p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 100 OR array_position(p_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Use a valid message selection' USING ERRCODE='PT400';
  END IF;
  IF soe_member_safety_private.contact_blocked(p_actor,p_peer) THEN
    RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT403';
  END IF;
  UPDATE public.direct_messages SET read=true
    WHERE recipient_id=p_actor AND sender_id=p_peer AND read IS FALSE AND id=ANY(p_ids);
  RETURN '{"ok":true}'::jsonb;
END;
$$;

CREATE FUNCTION public.soe_direct_message_blocks(p_actor uuid,p_after uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog SET row_security = off AS $$
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Member access required' USING ERRCODE='PT403'; END IF;
  RETURN (
    WITH page AS (
      SELECT b.block_id,b.revision,b.changed_at,CASE WHEN m.profile_visibility='public'
        THEN public._soe_circle_message_name(m.display_name) ELSE 'Explorer' END AS label
      FROM soe_member_safety_private.member_blocks AS b LEFT JOIN public.members AS m ON m.id=b.peer_id
      WHERE b.actor_id=p_actor AND b.blocked AND (p_after IS NULL OR b.block_id>p_after)
      ORDER BY b.block_id LIMIT 26
    ), shown AS (SELECT * FROM page ORDER BY block_id LIMIT 25)
    SELECT jsonb_build_object(
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object('blockId',block_id,'revision',revision,'label',label,'changedAt',changed_at)
        ORDER BY block_id) FROM shown),'[]'::jsonb),
      'nextCursor',CASE WHEN (SELECT count(*) FROM page)>25 THEN (SELECT block_id FROM shown ORDER BY block_id DESC LIMIT 1) END
    )
  );
END;
$$;

CREATE FUNCTION public.soe_direct_message_set_block(
  p_actor uuid,p_peer uuid,p_block_id uuid,p_blocked boolean,p_expected_revision bigint,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog SET row_security = off SET lock_timeout = '3s' AS $$
DECLARE peer uuid := p_peer;
  prior soe_member_safety_private.member_blocks%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL
    OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990
    OR NOT (
      (p_blocked IS TRUE AND p_peer IS NOT NULL AND p_block_id IS NULL AND p_peer<>p_actor)
      OR (p_blocked IS FALSE AND p_peer IS NULL AND p_block_id IS NOT NULL)
    )
  THEN
    RAISE EXCEPTION 'Review a valid block change' USING ERRCODE='PT400';
  END IF;
  IF p_blocked IS FALSE THEN
    SELECT peer_id INTO peer FROM soe_member_safety_private.member_blocks WHERE actor_id=p_actor AND block_id=p_block_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Block unavailable' USING ERRCODE='PT404'; END IF;
  END IF;
  PERFORM soe_member_safety_private.lock_pair(p_actor,peer);
  SELECT * INTO prior FROM soe_member_safety_private.member_blocks WHERE actor_id=p_actor AND peer_id=peer;
  IF prior.last_request_id=p_request_id THEN
    IF prior.blocked IS DISTINCT FROM p_blocked OR prior.revision<>p_expected_revision+1 THEN
      RAISE EXCEPTION 'Block request conflicts' USING ERRCODE='PT409';
    END IF;
  ELSE
    IF coalesce(prior.revision,0)<>p_expected_revision THEN
      RAISE EXCEPTION 'Review the current block first' USING ERRCODE='PT409';
    END IF;
    IF p_blocked AND NOT EXISTS (SELECT 1 FROM public.members WHERE id=peer) THEN
      RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='PT404';
    END IF;
    INSERT INTO soe_member_safety_private.member_blocks(actor_id,peer_id,blocked,revision,last_request_id)
      VALUES(p_actor,peer,p_blocked,p_expected_revision+1,p_request_id)
      ON CONFLICT (actor_id,peer_id) DO UPDATE SET blocked=excluded.blocked,revision=excluded.revision,
        last_request_id=excluded.last_request_id,changed_at=excluded.changed_at
      RETURNING * INTO prior;
  END IF;
  RETURN jsonb_build_object('requestId',p_request_id,'blockId',prior.block_id,
    'blockedByMe',prior.blocked,'revision',prior.revision);
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA soe_member_safety_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.soe_direct_message_read(uuid,uuid),public.soe_direct_message_send(uuid,uuid,text),
  public.soe_direct_message_ack(uuid,uuid,uuid[]),public.soe_direct_message_blocks(uuid,uuid),
  public.soe_direct_message_set_block(uuid,uuid,uuid,boolean,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.soe_direct_message_read(uuid,uuid),public.soe_direct_message_send(uuid,uuid,text),
  public.soe_direct_message_ack(uuid,uuid,uuid[]),public.soe_direct_message_blocks(uuid,uuid),
  public.soe_direct_message_set_block(uuid,uuid,uuid,boolean,bigint,uuid) TO service_role;

REVOKE ALL ON TABLE public.direct_messages FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL (id,sender_id,recipient_id,content,created_at,read)
  ON TABLE public.direct_messages FROM PUBLIC,anon,authenticated,service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')
      AND (has_table_privilege(r.oid,'public.direct_messages','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(r.oid,'public.direct_messages','SELECT,INSERT,UPDATE,REFERENCES'))
  ) THEN
    RAISE EXCEPTION 'Raw direct-message access requires review' USING ERRCODE='PT409';
  END IF;
END;
$$;
COMMIT;
