-- Owner-reviewed draft. Apply after the Circle post erasure draft on an isolated
-- restore. The owner reviews the exact profile, legacy posts and message scope.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE soe_account_deletion_private.contact_receipts (
  request_id uuid PRIMARY KEY REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT,
  reviewed_scope jsonb NOT NULL,
  incoming_detach_approved boolean NOT NULL,
  cleared_at timestamptz NOT NULL
);
CREATE TABLE soe_account_deletion_private.contact_context (
  tx xid8 PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT
);
ALTER TABLE soe_account_deletion_private.contact_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_account_deletion_private.contact_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soe_account_deletion_private.contact_receipts,soe_account_deletion_private.contact_context
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION soe_account_deletion_private.cleared_profile_fields()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT '{"display_name":"Former member","email":null,"bio":null,"discipline":null,"skills":null,
           "project_description":null,"seeking":null,"philosophy":null,"profile_visibility":"private"}'::jsonb;
$$;

CREATE FUNCTION soe_account_deletion_private.contact_in_context(p_member uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM soe_account_deletion_private.contact_context AS c
    JOIN soe_account_deletion_private.processing AS p USING (request_id)
    WHERE c.tx=pg_current_xact_id_if_assigned() AND p.member_id=p_member
  );
$$;

CREATE FUNCTION soe_account_deletion_private.guard_frozen_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE = 'PT503';
  END IF;
  IF EXISTS (SELECT 1 FROM soe_account_deletion_private.processing AS p WHERE p.member_id=OLD.id)
    AND NOT (soe_account_deletion_private.contact_in_context(OLD.id)
      AND to_jsonb(NEW)=to_jsonb(OLD)||soe_account_deletion_private.cleared_profile_fields()) THEN
    RAISE EXCEPTION 'Account removal is in progress' USING ERRCODE = 'PT403';
  END IF;
  RETURN NEW;
END;
$$;
-- This guard runs before the existing revision triggers. The existing
-- triggers advance the revision for a successful owner scrub.
CREATE TRIGGER soe_guard_frozen_profile BEFORE UPDATE OF
  display_name,email,bio,discipline,skills,project_description,seeking,philosophy,profile_visibility ON public.members
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_frozen_profile();

CREATE FUNCTION soe_account_deletion_private.guard_frozen_direct_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE old_sender uuid;
  old_recipient uuid;
BEGIN
  PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE = 'PT503';
  END IF;
  IF TG_OP='UPDATE' THEN
    old_sender:=OLD.sender_id;
    old_recipient:=OLD.recipient_id;
    IF old_sender IS NOT NULL AND old_sender IS DISTINCT FROM old_recipient
      AND NEW.recipient_id IS NULL AND soe_account_deletion_private.contact_in_context(old_recipient)
      AND to_jsonb(NEW)=to_jsonb(OLD)||'{"recipient_id":null}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM soe_account_deletion_private.processing AS p
    WHERE p.member_id IN (NEW.sender_id,NEW.recipient_id,old_sender,old_recipient)
  ) THEN
    RAISE EXCEPTION 'Account removal is in progress' USING ERRCODE = 'PT403';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER soe_guard_frozen_direct_message BEFORE INSERT OR UPDATE ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_frozen_direct_message();

CREATE FUNCTION soe_account_deletion_private.check_contact_erasure_shape()
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
BEGIN
  PERFORM soe_account_deletion_private.check_circle_post_erasure_shape();
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname='public' AND tablename='direct_messages')
    OR EXISTS (
      SELECT 1 FROM (VALUES ('anon'),('authenticated')) AS r(role_name)
      WHERE has_table_privilege(role_name,'public.direct_messages','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
        OR has_any_column_privilege(role_name,'public.direct_messages','SELECT,INSERT,UPDATE')
    )
    OR (
      SELECT jsonb_object_agg(attname,format_type(atttypid,atttypmod))
      FROM pg_attribute WHERE attrelid='public.direct_messages'::regclass AND attnum>0 AND NOT attisdropped
    ) IS DISTINCT FROM '{"id":"uuid","created_at":"timestamp with time zone","sender_id":"uuid",
                         "recipient_id":"uuid","content":"text","read":"boolean"}'::jsonb
    OR EXISTS (
      SELECT 1 FROM pg_constraint AS f WHERE f.contype='f' AND (
        f.confrelid='public.direct_messages'::regclass OR
        (f.confrelid='public.members'::regclass AND EXISTS (
          SELECT 1 FROM pg_attribute AS a WHERE a.attrelid=f.confrelid AND a.attnum=ANY(f.confkey)
            AND (a.attname='profile_revision' OR soe_account_deletion_private.cleared_profile_fields() ? a.attname::text)
        ))
      )
    )
    OR EXISTS (
      SELECT 1 FROM pg_rewrite AS r WHERE r.ev_class IN ('public.direct_messages'::regclass,'public.members'::regclass)
    )
    OR EXISTS (
      SELECT 1 FROM pg_trigger AS t WHERE NOT t.tgisinternal AND (t.tgtype::int & 24)<>0
        AND t.tgrelid IN ('public.direct_messages'::regclass,'public.members'::regclass)
        AND t.tgname NOT IN ('soe_guard_frozen_direct_message','soe_guard_frozen_profile',
          'soe_member_profile_revision_guard','soe_member_profile_write_intent_guard','soe_serialize_member_erasure')
    )
    OR (
      SELECT count(*) FROM pg_trigger AS t WHERE t.tgenabled='O' AND (t.tgrelid,t.tgname,t.tgfoid,t.tgtype) IN (
        ('public.direct_messages'::regclass,'soe_guard_frozen_direct_message'::name,
          'soe_account_deletion_private.guard_frozen_direct_message()'::regprocedure,23),
        ('public.members'::regclass,'soe_guard_frozen_profile'::name,
          'soe_account_deletion_private.guard_frozen_profile()'::regprocedure,19),
        ('public.members'::regclass,'soe_member_profile_revision_guard'::name,
          'public.soe_member_profile_revision_guard()'::regprocedure,23),
        ('public.members'::regclass,'soe_member_profile_write_intent_guard'::name,
          'public.soe_member_profile_write_intent_guard()'::regprocedure,19)
      )
    ) <> 4 THEN
    RAISE EXCEPTION 'Profile or direct-message relationships require review' USING ERRCODE = 'PT409';
  END IF;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.legacy_posts_for_member(p_member uuid)
RETURNS uuid[] LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(array_agg(m.id ORDER BY m.id),ARRAY[]::uuid[])
  FROM public.seminar_messages AS m LEFT JOIN public.book_cohorts AS c ON c.id=m.cohort_id
  WHERE m.member_id=p_member AND c.book_id IS DISTINCT FROM 'soe-circles-path';
$$;

CREATE FUNCTION soe_account_deletion_private.check_legacy_post_dependencies(p_targets uuid[])
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.circle_message_states AS s WHERE s.message_id=ANY(p_targets))
    OR EXISTS (SELECT 1 FROM public.circle_message_reports AS r WHERE r.message_id=ANY(p_targets))
    OR EXISTS (SELECT 1 FROM public.circle_message_decisions AS d WHERE d.message_id=ANY(p_targets))
    OR EXISTS (SELECT 1 FROM public.circle_message_ai_consents AS c WHERE c.message_id=ANY(p_targets))
    OR EXISTS (SELECT 1 FROM public.circle_message_ai_attempts AS a WHERE a.message_id=ANY(p_targets))
    OR EXISTS (SELECT 1 FROM public.circle_review_coverage_sessions AS c WHERE c.message_id=ANY(p_targets))
    OR EXISTS (SELECT 1 FROM public.circle_discussion_post_receipts AS r WHERE r.message_id=ANY(p_targets))
    OR EXISTS (SELECT 1 FROM public.circle_passage_post_receipts AS r WHERE r.message_id=ANY(p_targets))
    OR EXISTS (SELECT 1 FROM public.circle_message_reply_links AS l
      WHERE l.message_id=ANY(p_targets) OR l.parent_message_id=ANY(p_targets) OR l.root_message_id=ANY(p_targets))
    OR EXISTS (SELECT 1 FROM public.circle_message_receipts AS r
      WHERE EXISTS (SELECT 1 FROM unnest(p_targets) AS t(id)
        WHERE t.id::text IN (r.payload->>'messageId',r.result->>'messageId'))) THEN
    RAISE EXCEPTION 'Legacy post references Circle evidence and requires review' USING ERRCODE = 'PT409';
  END IF;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.contact_scope(p_member uuid,p_posts uuid[])
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog SET TimeZone = 'UTC' AS $$
  WITH items(kind, row_data) AS (
    SELECT 'profile',jsonb_build_array(m.display_name,m.email,m.bio,m.discipline,m.skills,
      m.project_description,m.seeking,m.philosophy,m.profile_visibility,m.profile_revision)
    FROM public.members AS m WHERE m.id=p_member
    UNION ALL SELECT 'legacy',to_jsonb(m) FROM public.seminar_messages AS m WHERE m.id=ANY(p_posts)
    UNION ALL SELECT CASE WHEN d.sender_id=p_member OR d.sender_id IS NULL THEN 'erase' ELSE 'detach' END,to_jsonb(d)
      FROM public.direct_messages AS d WHERE p_member IN (d.sender_id,d.recipient_id)
  ), digests AS (
    SELECT kind,encode(sha256(convert_to(row_data::text,'UTF8')),'hex') AS digest FROM items
  )
  SELECT jsonb_build_object(
    'profile',count(*) FILTER (WHERE kind='profile'),
    'legacyPosts',count(*) FILTER (WHERE kind='legacy'),
    'eraseMessages',count(*) FILTER (WHERE kind='erase'),
    'detachMessages',count(*) FILTER (WHERE kind='detach'),
    'snapshot',encode(sha256(convert_to(coalesce(string_agg(kind||':'||digest,',' ORDER BY kind,digest),''),'UTF8')),'hex')
  ) FROM digests;
$$;

CREATE FUNCTION soe_account_deletion_private.preview_contact_data(p_request uuid,p_member uuid,p_auth uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE posts uuid[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM soe_account_deletion_private.processing AS p WHERE p.request_id=p_request
      AND p.member_id IS NOT DISTINCT FROM p_member AND p.auth_user_id IS NOT DISTINCT FROM p_auth
  ) THEN
    RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE = 'PT409';
  END IF;
  PERFORM soe_account_deletion_private.check_contact_erasure_shape();
  posts:=soe_account_deletion_private.legacy_posts_for_member(p_member);
  PERFORM soe_account_deletion_private.check_legacy_post_dependencies(posts);
  RETURN soe_account_deletion_private.contact_scope(p_member,posts);
END;
$$;

CREATE FUNCTION soe_account_deletion_private.verify_contact_erasure(p_member uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.members AS m WHERE m.id=p_member
      AND NOT (to_jsonb(m) @> soe_account_deletion_private.cleared_profile_fields())
  ) AND cardinality(soe_account_deletion_private.legacy_posts_for_member(p_member))=0
    AND NOT EXISTS (SELECT 1 FROM public.direct_messages AS d WHERE p_member IN (d.sender_id,d.recipient_id));
$$;

CREATE FUNCTION soe_account_deletion_private.erase_contact_data(
  p_request uuid,p_member uuid,p_auth uuid,p_reviewed_scope jsonb,p_incoming_detach_approved boolean
)
RETURNS timestamptz LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog SET lock_timeout = '3s' AS $$
DECLARE
  posts uuid[];
  scope jsonb;
  prior soe_account_deletion_private.contact_receipts%ROWTYPE;
  finished_at timestamptz;
  affected bigint;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Erase contact data in a read-committed transaction' USING ERRCODE = 'PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing AS p WHERE p.request_id=p_request
    AND p.member_id IS NOT DISTINCT FROM p_member AND p.auth_user_id IS NOT DISTINCT FROM p_auth
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE = 'PT409';
  END IF;
  LOCK TABLE public.members,public.direct_messages,public.seminar_messages IN ROW EXCLUSIVE MODE;
  PERFORM soe_account_deletion_private.check_contact_erasure_shape();
  SELECT * INTO prior FROM soe_account_deletion_private.contact_receipts WHERE request_id=p_request;
  IF FOUND THEN
    IF prior.reviewed_scope IS DISTINCT FROM p_reviewed_scope OR prior.incoming_detach_approved IS DISTINCT FROM p_incoming_detach_approved
      OR NOT soe_account_deletion_private.verify_contact_erasure(p_member) THEN
      RAISE EXCEPTION 'Contact data removal requires review' USING ERRCODE = 'PT409';
    END IF;
    RETURN prior.cleared_at;
  END IF;

  PERFORM 1 FROM public.members WHERE id=p_member FOR NO KEY UPDATE;
  PERFORM 1 FROM public.direct_messages AS d WHERE p_member IN (d.sender_id,d.recipient_id) ORDER BY d.id FOR UPDATE;
  posts:=soe_account_deletion_private.legacy_posts_for_member(p_member);
  PERFORM 1 FROM public.book_cohorts AS c
    WHERE EXISTS (SELECT 1 FROM public.seminar_messages AS m WHERE m.id=ANY(posts) AND m.cohort_id=c.id)
    ORDER BY c.id FOR UPDATE;
  PERFORM 1 FROM public.seminar_messages WHERE id=ANY(posts) ORDER BY id FOR UPDATE;
  PERFORM soe_account_deletion_private.check_legacy_post_dependencies(posts);
  scope:=soe_account_deletion_private.contact_scope(p_member,posts);
  IF scope IS DISTINCT FROM p_reviewed_scope OR p_incoming_detach_approved IS NULL OR (
    NOT p_incoming_detach_approved AND (scope->>'detachMessages')::bigint>0
  ) THEN
    RAISE EXCEPTION 'Review current contact data and remaining sender copies' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO soe_account_deletion_private.contact_context (tx,request_id) VALUES (pg_current_xact_id(),p_request);
  DELETE FROM public.direct_messages AS d
    WHERE d.sender_id=p_member OR (d.recipient_id=p_member AND d.sender_id IS NULL);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>(scope->>'eraseMessages')::bigint THEN
    RAISE EXCEPTION 'Direct messages changed during removal' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.direct_messages SET recipient_id=NULL WHERE recipient_id=p_member;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>(scope->>'detachMessages')::bigint THEN
    RAISE EXCEPTION 'Sender copies changed during removal' USING ERRCODE = 'PT409';
  END IF;
  DELETE FROM public.seminar_messages WHERE id=ANY(posts);
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>(scope->>'legacyPosts')::bigint THEN
    RAISE EXCEPTION 'Legacy posts changed during removal' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.members SET display_name='Former member',email=NULL,bio=NULL,discipline=NULL,skills=NULL,
    project_description=NULL,seeking=NULL,philosophy=NULL,profile_visibility='private' WHERE id=p_member;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>(scope->>'profile')::bigint OR NOT soe_account_deletion_private.verify_contact_erasure(p_member) THEN
    RAISE EXCEPTION 'Contact data removal could not be verified' USING ERRCODE = 'PT409';
  END IF;
  DELETE FROM soe_account_deletion_private.contact_context WHERE tx=pg_current_xact_id();
  finished_at:=clock_timestamp();
  INSERT INTO soe_account_deletion_private.contact_receipts (request_id,reviewed_scope,incoming_detach_approved,cleared_at)
    VALUES (p_request,scope,p_incoming_detach_approved,finished_at);
  RETURN finished_at;
END;
$$;

REVOKE ALL ON FUNCTION soe_account_deletion_private.cleared_profile_fields(),
  soe_account_deletion_private.contact_in_context(uuid),
  soe_account_deletion_private.guard_frozen_profile(),
  soe_account_deletion_private.guard_frozen_direct_message(),
  soe_account_deletion_private.check_contact_erasure_shape(),
  soe_account_deletion_private.legacy_posts_for_member(uuid),
  soe_account_deletion_private.check_legacy_post_dependencies(uuid[]),
  soe_account_deletion_private.contact_scope(uuid,uuid[]),
  soe_account_deletion_private.preview_contact_data(uuid,uuid,uuid),
  soe_account_deletion_private.verify_contact_erasure(uuid),
  soe_account_deletion_private.erase_contact_data(uuid,uuid,uuid,jsonb,boolean)
FROM PUBLIC,anon,authenticated,service_role;

DO $$
BEGIN
  PERFORM soe_account_deletion_private.check_contact_erasure_shape();
  IF EXISTS (
    SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS caller(role_name)
    WHERE pg_has_role(role_name,current_user,'MEMBER')
      OR EXISTS (
        SELECT 1 FROM (VALUES ('contact_receipts'),('contact_context')) AS r(name)
        WHERE has_table_privilege(role_name,'soe_account_deletion_private.'||r.name,
                                  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      )
      OR EXISTS (
        SELECT 1 FROM pg_proc AS f JOIN pg_namespace AS n ON n.oid=f.pronamespace
        WHERE n.nspname='soe_account_deletion_private' AND f.proname IN (
          'cleared_profile_fields','contact_in_context','guard_frozen_profile','guard_frozen_direct_message',
          'check_contact_erasure_shape','legacy_posts_for_member','check_legacy_post_dependencies',
          'contact_scope','preview_contact_data','verify_contact_erasure','erase_contact_data'
        ) AND has_function_privilege(role_name,f.oid,'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected effective contact erasure privileges';
  END IF;
END;
$$;

COMMIT;
