-- Unapplied owner-reviewed draft. Stage after Waddle erasure and Circle
-- member blocks on a disposable restore. Drain old callers at a hosted cutover.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE ONLY soe_member_safety_private.member_blocks IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE expected record;
  target constant regclass := 'soe_member_safety_private.member_blocks'::regclass;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.oid=target AND c.relkind='r' AND c.relowner=current_user::regrole
      AND n.nspowner=current_user::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity
  ) OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=target)
    OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=target) THEN
    RAISE EXCEPTION 'Review the installed member block store before erasure' USING ERRCODE='PT409';
  END IF;

  FOR expected IN SELECT * FROM (VALUES
    ('public.soe_direct_message_set_block(uuid,uuid,uuid,boolean,bigint,uuid)','180fd3358edbe8b0995b99011ff595bcadf2bde58fc0ccd20dec71a9065a864e'),
    ('soe_member_safety_private.lock_pair(uuid,uuid)','32cdecd68bc23e5d17f5c34da2cce52bb8e197bd76146806f2b64cc2d489ed66'),
    ('soe_account_deletion_private.start_erasure(uuid,uuid,uuid)','affeded28abef6332b1aed13664fa94e6ecf2cf6fb5436ae287e12cd304231d3'),
    ('soe_account_deletion_private.check_identity_prerequisites(uuid,uuid)','bb97c1d572f85a9bcbec76e3b38c960f381fb5431fc558982ea4c7532ab6c081')
  ) AS inputs(signature,source_sha) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature) AND p.proowner=current_user::regrole
        AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=expected.source_sha
        AND p.prosecdef=(p.proname='soe_direct_message_set_block')
        AND p.proconfig=CASE
          WHEN p.proname='soe_direct_message_set_block' THEN ARRAY['search_path=pg_catalog','row_security=off','lock_timeout=3s']
          WHEN p.proname='start_erasure' THEN ARRAY['search_path=pg_catalog','lock_timeout=3s']
          ELSE ARRAY['search_path=pg_catalog'] END
        AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
        AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
        AND has_function_privilege('service_role',p.oid,'EXECUTE')=(p.proname IN ('soe_direct_message_set_block','lock_pair'))
    ) THEN
      RAISE EXCEPTION 'Review prerequisite % before adding block erasure',expected.signature USING ERRCODE='PT409';
    END IF;
  END LOOP;
END;
$$;

CREATE INDEX member_blocks_peer_id_idx ON soe_member_safety_private.member_blocks(peer_id);

CREATE TABLE soe_account_deletion_private.member_block_erasure_receipts (
  request_id uuid PRIMARY KEY REFERENCES soe_account_deletion_private.requests(request_id) ON DELETE RESTRICT,
  reviewed_scope jsonb NOT NULL CHECK (jsonb_typeof(reviewed_scope)='object'),
  erased_at timestamptz NOT NULL
);
ALTER TABLE soe_account_deletion_private.member_block_erasure_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soe_account_deletion_private.member_block_erasure_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Share the start-erasure lock. The owner waits for an earlier block change;
-- a later request sees the new processing row before it can write or replay.
CREATE FUNCTION soe_account_deletion_private.require_writable_member_block_pair(p_actor uuid,p_peer uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Review member block changes in a read-committed transaction' USING ERRCODE='PT409';
  END IF;
  PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE='PT503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM soe_account_deletion_private.processing p WHERE p.member_id IN (p_actor,p_peer)
  ) THEN
    RAISE EXCEPTION 'This conversation is unavailable' USING ERRCODE='PT403';
  END IF;
  IF p_actor IS NULL OR p_peer IS NULL OR NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_actor)
    OR NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_peer) THEN
    RAISE EXCEPTION 'This conversation is unavailable' USING ERRCODE='PT404';
  END IF;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.guard_member_block_erasure_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.actor_id,NEW.peer_id,NEW.block_id) IS DISTINCT FROM (OLD.actor_id,OLD.peer_id,OLD.block_id) THEN
    RAISE EXCEPTION 'Member block identity is fixed' USING ERRCODE='PT409';
  END IF;
  PERFORM soe_account_deletion_private.require_writable_member_block_pair(NEW.actor_id,NEW.peer_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER soe_guard_member_block_erasure_write
  BEFORE INSERT OR UPDATE ON soe_member_safety_private.member_blocks
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_member_block_erasure_write();

CREATE FUNCTION soe_account_deletion_private.check_member_block_erasure_shape()
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog SET row_security = off AS $$
DECLARE target constant regclass := 'soe_member_safety_private.member_blocks'::regclass;
  receipts constant regclass := 'soe_account_deletion_private.member_block_erasure_receipts'::regclass;
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.oid IN (target,receipts) AND c.relkind='r' AND c.relowner=current_user::regrole
        AND n.nspowner=current_user::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity)<>2
    OR current_setting('session_replication_role') NOT IN ('origin','local')
    OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid IN (target,receipts) OR inhparent IN (target,receipts))
    OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid IN (target,receipts))
    OR EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class IN (target,receipts))
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND (confrelid=target OR conrelid=target))
    OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname IN ('soe_member_safety_private','soe_account_deletion_private')
      AND tablename IN ('member_blocks','member_block_erasure_receipts'))
    OR EXISTS (
      SELECT 1 FROM pg_roles r CROSS JOIN (VALUES (target),(receipts)) AS relation(id)
      WHERE r.rolname IN ('anon','authenticated','service_role')
        AND (has_table_privilege(r.oid,relation.id,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(r.oid,relation.id,'SELECT,INSERT,UPDATE,REFERENCES'))
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t WHERE t.tgrelid=target AND t.tgname='soe_guard_member_block_erasure_write'
        AND t.tgfoid='soe_account_deletion_private.guard_member_block_erasure_write()'::regprocedure
        AND t.tgtype=23 AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgnargs=0 AND t.tgqual IS NULL
    ) OR EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid IN (target,receipts) AND NOT tgisinternal
        AND (tgrelid<>target OR tgname<>'soe_guard_member_block_erasure_write')
    ) THEN
    RAISE EXCEPTION 'Review the current member block storage and erasure guard' USING ERRCODE='PT409';
  END IF;
END;
$$;
SELECT soe_account_deletion_private.check_member_block_erasure_shape();

-- Preview counts and a digest only. The sorted row hashes bind the review to
-- the exact request, stored pair identifiers and current revisions.
CREATE FUNCTION soe_account_deletion_private.member_block_erasure_scope(p_request uuid,p_member uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog SET row_security = off AS $$
  SELECT jsonb_build_object(
    'version',1,'outbound',count(*) FILTER (WHERE b.actor_id=p_member),
    'inbound',count(*) FILTER (WHERE b.peer_id=p_member),'active',count(*) FILTER (WHERE b.blocked),
    'sha256',encode(sha256(convert_to(jsonb_build_array('soe-member-block-erasure-v1',p_request,p_member,
      coalesce(string_agg(encode(sha256(convert_to(jsonb_build_array(b.block_id,b.actor_id,b.peer_id,
        b.blocked,b.revision,b.last_request_id,extract(epoch FROM b.changed_at))::text,'UTF8')),'hex'),
        '' ORDER BY b.block_id),'')
    )::text,'UTF8')),'hex')
  )
  FROM soe_member_safety_private.member_blocks b WHERE b.actor_id=p_member OR b.peer_id=p_member;
$$;

CREATE FUNCTION soe_account_deletion_private.verify_member_block_erasure(p_request uuid,p_member uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog SET row_security = off AS $$
  SELECT p_member IS NOT NULL AND EXISTS (
    SELECT 1 FROM soe_account_deletion_private.processing p
    JOIN soe_account_deletion_private.member_block_erasure_receipts r USING (request_id)
    WHERE p.request_id=p_request AND p.member_id=p_member
  ) AND NOT EXISTS (
    SELECT 1 FROM soe_member_safety_private.member_blocks b WHERE b.actor_id=p_member OR b.peer_id=p_member
  );
$$;

CREATE FUNCTION soe_account_deletion_private.preview_member_block_erasure(p_request uuid,p_member uuid,p_auth uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog SET row_security = off AS $$
DECLARE prior soe_account_deletion_private.member_block_erasure_receipts%ROWTYPE;
BEGIN
  IF p_member IS NULL OR NOT EXISTS (
    SELECT 1 FROM soe_account_deletion_private.processing p WHERE p.request_id=p_request
      AND p.member_id=p_member AND p.auth_user_id IS NOT DISTINCT FROM p_auth
  ) THEN
    RAISE EXCEPTION 'No processing request matched the reviewed member' USING ERRCODE='PT409';
  END IF;
  PERFORM soe_account_deletion_private.check_member_block_erasure_shape();
  SELECT * INTO prior FROM soe_account_deletion_private.member_block_erasure_receipts WHERE request_id=p_request;
  IF FOUND THEN
    IF NOT soe_account_deletion_private.verify_member_block_erasure(p_request,p_member) THEN
      RAISE EXCEPTION 'Member block erasure requires a new review' USING ERRCODE='PT409';
    END IF;
    RETURN jsonb_build_object('phase','erased','reviewedScope',prior.reviewed_scope,'erasedAt',prior.erased_at);
  END IF;
  RETURN jsonb_build_object('phase','review','reviewedScope',soe_account_deletion_private.member_block_erasure_scope(p_request,p_member));
END;
$$;

CREATE FUNCTION soe_account_deletion_private.erase_member_blocks(
  p_request uuid,p_member uuid,p_auth uuid,p_reviewed_scope jsonb,p_approved boolean
) RETURNS timestamptz LANGUAGE plpgsql SET search_path = pg_catalog SET row_security = off SET lock_timeout = '3s' AS $$
DECLARE current_scope jsonb;
  prior soe_account_deletion_private.member_block_erasure_receipts%ROWTYPE;
  removed bigint;
  erased timestamptz;
BEGIN
  IF p_member IS NULL OR p_approved IS DISTINCT FROM true OR current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Approve the exact member block review in a read-committed transaction' USING ERRCODE='PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing p WHERE p.request_id=p_request
    AND p.member_id=p_member AND p.auth_user_id IS NOT DISTINCT FROM p_auth FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No processing request matched the reviewed member' USING ERRCODE='PT409';
  END IF;
  LOCK TABLE ONLY soe_member_safety_private.member_blocks IN ROW EXCLUSIVE MODE;
  PERFORM soe_account_deletion_private.check_member_block_erasure_shape();
  SELECT * INTO prior FROM soe_account_deletion_private.member_block_erasure_receipts WHERE request_id=p_request;
  IF FOUND THEN
    IF prior.reviewed_scope IS DISTINCT FROM p_reviewed_scope OR NOT soe_account_deletion_private.verify_member_block_erasure(p_request,p_member) THEN
      RAISE EXCEPTION 'Repeat the original verified member block review' USING ERRCODE='PT409';
    END IF;
    RETURN prior.erased_at;
  END IF;

  -- Leave existing blocks in place until deleting them cannot uncover old
  -- messages or Circle posts involving the departing member.
  PERFORM soe_account_deletion_private.check_contact_erasure_shape();
  PERFORM soe_account_deletion_private.check_circle_post_erasure_shape();
  IF NOT EXISTS (SELECT 1 FROM soe_account_deletion_private.circle_post_receipts WHERE request_id=p_request)
    OR NOT EXISTS (SELECT 1 FROM soe_account_deletion_private.contact_receipts WHERE request_id=p_request)
    OR cardinality(soe_account_deletion_private.circle_posts_for_member(p_member))<>0
    OR NOT soe_account_deletion_private.verify_circle_post_erasure(p_request)
    OR NOT soe_account_deletion_private.verify_contact_erasure(p_member) THEN
    RAISE EXCEPTION 'Verify Circle post and contact erasure before removing blocks' USING ERRCODE='PT409';
  END IF;

  -- Two departing accounts may share a block. Lock in the same order and
  -- recompute after waiting so the second reviewer sees any changed scope.
  PERFORM b.block_id FROM soe_member_safety_private.member_blocks b
    WHERE b.actor_id=p_member OR b.peer_id=p_member ORDER BY b.block_id FOR UPDATE;
  current_scope:=soe_account_deletion_private.member_block_erasure_scope(p_request,p_member);
  IF current_scope IS DISTINCT FROM p_reviewed_scope THEN
    RAISE EXCEPTION 'Review the current member block set first' USING ERRCODE='PT409';
  END IF;
  DELETE FROM soe_member_safety_private.member_blocks b WHERE b.actor_id=p_member OR b.peer_id=p_member;
  GET DIAGNOSTICS removed=ROW_COUNT;
  IF removed<>(current_scope->>'outbound')::bigint+(current_scope->>'inbound')::bigint THEN
    RAISE EXCEPTION 'Member block set changed during erasure' USING ERRCODE='PT409';
  END IF;

  erased:=clock_timestamp();
  INSERT INTO soe_account_deletion_private.member_block_erasure_receipts(request_id,reviewed_scope,erased_at)
    VALUES(p_request,current_scope,erased);
  IF NOT soe_account_deletion_private.verify_member_block_erasure(p_request,p_member) THEN
    RAISE EXCEPTION 'Member block erasure could not be verified' USING ERRCODE='PT409';
  END IF;
  RETURN erased;
END;
$$;

CREATE OR REPLACE FUNCTION public.soe_direct_message_set_block(
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
  PERFORM soe_account_deletion_private.require_writable_member_block_pair(p_actor,peer);
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
  IF p_member IS NOT NULL THEN
    PERFORM soe_account_deletion_private.check_member_block_erasure_shape();
    IF NOT soe_account_deletion_private.verify_member_block_erasure(p_request,p_member) THEN
      RAISE EXCEPTION 'Member block erasure requires verification' USING ERRCODE='PT409';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION soe_account_deletion_private.require_writable_member_block_pair(uuid,uuid),
  soe_account_deletion_private.guard_member_block_erasure_write(),
  soe_account_deletion_private.check_member_block_erasure_shape(),
  soe_account_deletion_private.member_block_erasure_scope(uuid,uuid),
  soe_account_deletion_private.verify_member_block_erasure(uuid,uuid),
  soe_account_deletion_private.preview_member_block_erasure(uuid,uuid,uuid),
  soe_account_deletion_private.erase_member_blocks(uuid,uuid,uuid,jsonb,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
