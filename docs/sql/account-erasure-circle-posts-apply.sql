-- Owner-reviewed draft. Apply after account-erasure-private-data-apply.sql
-- on an isolated restore. Keep thread anchors and erase directly linked text.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.seminar_messages, public.circle_message_decisions, public.circle_message_receipts,
  public.circle_message_reports, public.circle_reports, public.circle_report_receipts
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc AS f WHERE f.oid = 'public._soe_circle_message_immutable()'::regprocedure
      AND f.proowner = current_user::regrole AND NOT f.prosecdef
      AND md5(f.prosrc) = '71e2c1f0ef6ff046bf98dcc75c485afa'
  ) OR (
    SELECT count(*) FROM pg_trigger AS t JOIN pg_class AS c ON c.oid = t.tgrelid
    WHERE t.tgfoid = 'public._soe_circle_message_immutable()'::regprocedure
      AND t.tgenabled = 'O' AND c.relowner = current_user::regrole AND
      (c.oid, t.tgname) IN (
        ('public.seminar_messages'::regclass, 'circle_message_identity_immutable'::name),
        ('public.circle_message_decisions'::regclass, 'circle_message_decisions_immutable'::name),
        ('public.circle_message_receipts'::regclass, 'circle_message_receipts_immutable'::name)
      )
  ) <> 3 THEN
    RAISE EXCEPTION 'Circle evidence guards require review';
  END IF;
END;
$$;

CREATE TABLE soe_account_deletion_private.circle_post_targets (
  message_id uuid PRIMARY KEY REFERENCES public.seminar_messages(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT
);
CREATE INDEX circle_post_targets_request_idx ON soe_account_deletion_private.circle_post_targets (request_id, message_id);
CREATE TABLE soe_account_deletion_private.circle_post_receipts (
  request_id uuid PRIMARY KEY REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT,
  reviewed_scope jsonb NOT NULL,
  evidence_approved boolean NOT NULL,
  cleared_at timestamptz NOT NULL
);
-- A context can authorize a scrub only inside its own database transaction.
-- The owner routine removes it before returning, including successful retries.
CREATE TABLE soe_account_deletion_private.circle_post_context (
  tx xid8 PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT
);
ALTER TABLE soe_account_deletion_private.circle_post_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_account_deletion_private.circle_post_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_account_deletion_private.circle_post_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soe_account_deletion_private.circle_post_targets,
  soe_account_deletion_private.circle_post_receipts, soe_account_deletion_private.circle_post_context
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION soe_account_deletion_private.circle_post_in_context(p_message text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM soe_account_deletion_private.circle_post_context AS c
    JOIN soe_account_deletion_private.circle_post_targets AS t USING (request_id)
    WHERE c.tx = pg_current_xact_id_if_assigned() AND t.message_id::text = p_message
  );
$$;

-- The old immutability branches remain the fallback. The owner exception is
-- an exact change to the approved message and copies in the current context.
CREATE OR REPLACE FUNCTION public._soe_circle_message_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog,public AS $$
DECLARE
  target text;
  permitted jsonb;
  removed text := 'Removed with account deletion.';
BEGIN
  IF TG_TABLE_NAME='book_cohorts' THEN
    IF OLD.book_id='soe-circles-path' AND NEW.book_id IS DISTINCT FROM OLD.book_id THEN
      RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Circle identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND current_user = pg_get_userbyid((SELECT c.relowner FROM pg_class AS c WHERE c.oid = TG_RELID)) THEN
    IF TG_TABLE_NAME = 'seminar_messages' THEN
      target := OLD.id::text;
      permitted := to_jsonb(OLD) || jsonb_build_object('member_id',NULL,'member_name','Former member',
        'sender_name',NULL,'thinker_id',NULL,'passage_reference',NULL,'content',removed);
    ELSIF TG_TABLE_NAME = 'circle_message_decisions' THEN
      target := OLD.message_id::text;
      permitted := to_jsonb(OLD) || jsonb_build_object('summary',removed,'evidence_report_id',NULL,
        'evidence_excerpt',CASE WHEN OLD.action = 'hide' THEN removed END,
        'content_hash',public._soe_circle_message_hash(removed));
    ELSIF TG_TABLE_NAME = 'circle_message_receipts' THEN
      target := coalesce(OLD.payload->>'messageId',OLD.result->>'messageId');
      permitted := to_jsonb(OLD) || jsonb_build_object(
        'payload',jsonb_build_object('messageId',target,'erased',true),
        'result',jsonb_build_object('erased',true));
    END IF;
    IF target IS NOT NULL AND to_jsonb(NEW) = permitted AND soe_account_deletion_private.circle_post_in_context(target) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF TG_TABLE_NAME IN ('circle_message_decisions','circle_message_receipts') THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Safety history is immutable';
  END IF;
  IF EXISTS(SELECT 1 FROM public.book_cohorts WHERE id=OLD.cohort_id AND book_id='soe-circles-path')
    OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.book_cohorts WHERE id=NEW.cohort_id AND book_id='soe-circles-path')) THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Circle posts are retained immutable evidence';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.guard_circle_post_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.member_id IS NULL THEN RETURN NEW; END IF;
  PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE = 'PT503';
  END IF;
  IF EXISTS (SELECT 1 FROM soe_account_deletion_private.processing AS p WHERE p.member_id = NEW.member_id) THEN
    RAISE EXCEPTION 'Account removal is in progress' USING ERRCODE = 'PT403';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER soe_guard_circle_post_insert BEFORE INSERT ON public.seminar_messages
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_circle_post_insert();

CREATE FUNCTION soe_account_deletion_private.guard_erased_circle_copy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  target uuid;
  previous uuid;
  actor uuid;
BEGIN
  -- The request may have passed app authentication before the account froze.
  -- A new report key can write a receipt even when an open report already exists.
  IF TG_TABLE_NAME IN ('circle_reports','circle_message_reports') THEN
    IF TG_OP='INSERT' THEN
      actor := NEW.reporter_member_id;
    ELSIF NEW.reporter_member_id IS DISTINCT FROM OLD.reporter_member_id THEN
      actor := NEW.reporter_member_id;
    END IF;
  ELSIF TG_TABLE_NAME IN ('circle_report_receipts','circle_message_receipts') THEN
    actor := NEW.actor_member_id;
  END IF;
  IF actor IS NOT NULL THEN
    PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE = 'PT503';
    END IF;
    IF EXISTS (SELECT 1 FROM soe_account_deletion_private.processing AS p WHERE p.member_id=actor) THEN
      RAISE EXCEPTION 'Account removal is in progress' USING ERRCODE = 'PT403';
    END IF;
  END IF;
  IF TG_TABLE_NAME IN ('circle_reports','circle_report_receipts') THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'circle_message_receipts' THEN
    target := (NEW.payload->>'messageId')::uuid;
    previous := (NEW.result->>'messageId')::uuid;
  ELSE
    IF TG_OP <> 'DELETE' THEN target := NEW.message_id; END IF;
    IF TG_OP <> 'INSERT' THEN previous := OLD.message_id; END IF;
  END IF;
  -- The erasure routine holds these same message rows for update.
  PERFORM 1 FROM public.seminar_messages AS m WHERE m.id IN (target,previous) ORDER BY m.id FOR SHARE;
  IF EXISTS (
    SELECT 1 FROM soe_account_deletion_private.circle_post_targets AS t
    WHERE t.message_id IN (target,previous) AND NOT soe_account_deletion_private.circle_post_in_context(t.message_id::text)
  ) THEN
    RAISE EXCEPTION 'Post removed through account deletion' USING ERRCODE = 'PT403';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER soe_guard_erased_copy BEFORE INSERT OR UPDATE OR DELETE ON public.circle_message_states
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_erased_circle_copy();
CREATE TRIGGER soe_guard_erased_copy BEFORE INSERT OR UPDATE ON public.circle_message_reports
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_erased_circle_copy();
CREATE TRIGGER soe_guard_erased_copy BEFORE INSERT ON public.circle_message_decisions
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_erased_circle_copy();
CREATE TRIGGER soe_guard_erased_copy BEFORE INSERT ON public.circle_message_receipts
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_erased_circle_copy();
CREATE TRIGGER soe_guard_erased_copy BEFORE INSERT OR UPDATE OF reporter_member_id ON public.circle_reports
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_erased_circle_copy();
CREATE TRIGGER soe_guard_erased_copy BEFORE INSERT ON public.circle_report_receipts
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_erased_circle_copy();
CREATE TRIGGER soe_guard_erased_copy BEFORE INSERT OR UPDATE ON public.circle_message_ai_consents
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_erased_circle_copy();
CREATE TRIGGER soe_guard_erased_copy BEFORE INSERT ON public.circle_message_ai_attempts
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_erased_circle_copy();
CREATE TRIGGER soe_guard_erased_copy BEFORE INSERT ON public.circle_review_coverage_sessions
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_erased_circle_copy();

CREATE FUNCTION soe_account_deletion_private.check_circle_post_erasure_shape()
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
BEGIN
  IF (
    SELECT count(*) FROM pg_constraint AS f
    WHERE f.contype = 'f' AND f.confrelid = 'public.seminar_messages'::regclass
  ) <> 8 OR EXISTS (
    SELECT 1 FROM pg_constraint AS f WHERE f.contype = 'f' AND f.confrelid = 'public.seminar_messages'::regclass
    AND (NOT f.convalidated OR f.confkey IS DISTINCT FROM ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid=f.confrelid AND attname='id' AND NOT attisdropped)
    ] OR f.conrelid NOT IN (
      'public.circle_discussion_post_receipts'::regclass,'public.circle_message_ai_consents'::regclass,
      'public.circle_message_reply_links'::regclass,'public.circle_message_states'::regclass,
      'public.circle_passage_post_receipts'::regclass,'soe_account_deletion_private.circle_post_targets'::regclass
    ))
  ) OR EXISTS (
    SELECT 1 FROM pg_trigger AS t
    WHERE NOT t.tgisinternal AND (t.tgtype::int & 24) <> 0 AND t.tgrelid IN (
      'public.seminar_messages'::regclass,'public.circle_message_states'::regclass,'public.circle_message_reports'::regclass,
      'public.circle_message_decisions'::regclass,'public.circle_message_receipts'::regclass,
      'public.circle_message_ai_consents'::regclass,'public.circle_review_coverage_sessions'::regclass
    ) AND t.tgname NOT IN (
      'circle_message_identity_immutable','circle_review_coverage_message_change',
      'circle_review_coverage_state_change','circle_review_coverage_message_report_change',
      'circle_message_decisions_immutable','circle_message_receipts_immutable','soe_guard_erased_copy'
    )
  ) OR EXISTS (
    SELECT 1 FROM pg_rewrite AS r WHERE r.ev_class IN (
      'public.seminar_messages'::regclass,'public.circle_message_states'::regclass,'public.circle_message_reports'::regclass,
      'public.circle_message_decisions'::regclass,'public.circle_message_receipts'::regclass,
      'public.circle_message_ai_consents'::regclass,'public.circle_review_coverage_sessions'::regclass
    )
  ) OR (
    SELECT count(*) FROM pg_trigger AS t WHERE t.tgenabled = 'O' AND t.tgname = 'soe_guard_erased_copy'
      AND t.tgfoid = 'soe_account_deletion_private.guard_erased_circle_copy()'::regprocedure
      AND t.tgrelid IN ('public.circle_message_states'::regclass,'public.circle_message_reports'::regclass,
        'public.circle_message_decisions'::regclass,'public.circle_message_receipts'::regclass,
        'public.circle_reports'::regclass,'public.circle_report_receipts'::regclass,
        'public.circle_message_ai_consents'::regclass,'public.circle_message_ai_attempts'::regclass,
        'public.circle_review_coverage_sessions'::regclass)
      AND t.tgtype=CASE
        WHEN t.tgrelid='public.circle_message_states'::regclass THEN 31
        WHEN t.tgrelid IN ('public.circle_reports'::regclass,'public.circle_message_reports'::regclass,
          'public.circle_message_ai_consents'::regclass) THEN 23
        ELSE 7
      END
      AND CASE WHEN t.tgrelid='public.circle_reports'::regclass THEN
        cardinality(t.tgattr::smallint[])=1 AND EXISTS (
          SELECT 1 FROM pg_attribute AS a WHERE a.attrelid=t.tgrelid AND a.attname='reporter_member_id'
            AND NOT a.attisdropped AND a.attnum=ANY(t.tgattr::smallint[])
        )
        ELSE cardinality(t.tgattr::smallint[])=0
      END
  ) <> 9 OR (
    SELECT count(*) FROM pg_trigger AS t
    WHERE t.tgenabled='O' AND t.tgtype=27 AND
      t.tgfoid='public._soe_circle_message_immutable()'::regprocedure AND
      (t.tgrelid,t.tgname) IN (
        ('public.seminar_messages'::regclass,'circle_message_identity_immutable'::name),
        ('public.circle_message_decisions'::regclass,'circle_message_decisions_immutable'::name),
        ('public.circle_message_receipts'::regclass,'circle_message_receipts_immutable'::name)
      )
  ) <> 3 OR NOT EXISTS (
    SELECT 1 FROM pg_trigger AS t WHERE t.tgenabled = 'O' AND t.tgname = 'soe_guard_circle_post_insert'
      AND t.tgrelid = 'public.seminar_messages'::regclass
      AND t.tgfoid = 'soe_account_deletion_private.guard_circle_post_insert()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Circle evidence relationships require review' USING ERRCODE = 'PT409';
  END IF;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.circle_posts_for_member(p_member uuid)
RETURNS uuid[] LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(array_agg(m.id ORDER BY m.id),ARRAY[]::uuid[])
  FROM public.seminar_messages AS m JOIN public.book_cohorts AS c ON c.id=m.cohort_id
  WHERE m.member_id=p_member AND c.book_id='soe-circles-path';
$$;

-- Review output contains counts and a snapshot digest, never the copied text.
CREATE FUNCTION soe_account_deletion_private.circle_erasure_scope(p_targets uuid[])
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog SET TimeZone = 'UTC' AS $$
  WITH items(kind, row_data) AS (
    SELECT 'post',to_jsonb(m) FROM public.seminar_messages AS m WHERE m.id=ANY(p_targets)
    UNION ALL SELECT 'state',to_jsonb(s) FROM public.circle_message_states AS s WHERE s.message_id=ANY(p_targets)
    UNION ALL SELECT 'report',to_jsonb(r) FROM public.circle_message_reports AS r WHERE r.message_id=ANY(p_targets)
    UNION ALL SELECT 'decision',to_jsonb(d) FROM public.circle_message_decisions AS d WHERE d.message_id=ANY(p_targets)
    UNION ALL SELECT 'receipt',to_jsonb(r) FROM public.circle_message_receipts AS r
      WHERE EXISTS (SELECT 1 FROM unnest(p_targets) AS t(id)
        WHERE t.id::text IN (r.payload->>'messageId',r.result->>'messageId'))
    UNION ALL SELECT 'consent',to_jsonb(c) FROM public.circle_message_ai_consents AS c WHERE c.message_id=ANY(p_targets)
  ), digests AS (
    SELECT kind,encode(sha256(convert_to(row_data::text,'UTF8')),'hex') AS digest FROM items
  )
  SELECT jsonb_build_object(
    'posts',count(*) FILTER (WHERE kind='post'),
    'reports',count(*) FILTER (WHERE kind='report'),
    'decisions',count(*) FILTER (WHERE kind='decision'),
    'receipts',count(*) FILTER (WHERE kind='receipt'),
    'consents',count(*) FILTER (WHERE kind='consent'),
    'snapshot',encode(sha256(convert_to(coalesce(string_agg(kind||':'||digest,',' ORDER BY kind,digest),''),'UTF8')),'hex')
  ) FROM digests;
$$;

CREATE FUNCTION soe_account_deletion_private.preview_circle_posts(p_request uuid,p_member uuid,p_auth uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM soe_account_deletion_private.processing AS p WHERE p.request_id=p_request
      AND p.member_id IS NOT DISTINCT FROM p_member AND p.auth_user_id IS NOT DISTINCT FROM p_auth
  ) THEN
    RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE = 'PT409';
  END IF;
  PERFORM soe_account_deletion_private.check_circle_post_erasure_shape();
  RETURN soe_account_deletion_private.circle_erasure_scope(soe_account_deletion_private.circle_posts_for_member(p_member));
END;
$$;

CREATE FUNCTION soe_account_deletion_private.verify_circle_post_erasure(p_request uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM soe_account_deletion_private.circle_post_targets AS t
    JOIN public.seminar_messages AS m ON m.id=t.message_id
    LEFT JOIN public.circle_message_states AS s ON s.message_id=m.id
    WHERE t.request_id=p_request AND (
      m.member_id IS NOT NULL OR m.member_name IS DISTINCT FROM 'Former member' OR m.sender_name IS NOT NULL
      OR m.thinker_id IS NOT NULL OR m.passage_reference IS NOT NULL OR m.content<>'Removed with account deletion.'
      OR s.withdrawn IS DISTINCT FROM true OR s.hidden IS DISTINCT FROM false
      OR EXISTS (SELECT 1 FROM public.circle_message_reports AS r WHERE r.message_id=m.id AND (r.note IS NOT NULL OR r.status='open'))
      OR EXISTS (SELECT 1 FROM public.circle_message_decisions AS d WHERE d.message_id=m.id AND (
        d.summary<>'Removed with account deletion.' OR d.evidence_report_id IS NOT NULL
        OR d.evidence_excerpt IS DISTINCT FROM CASE WHEN d.action='hide' THEN 'Removed with account deletion.' END
        OR d.content_hash<>public._soe_circle_message_hash(m.content)
      ))
      OR EXISTS (SELECT 1 FROM public.circle_message_receipts AS r
        WHERE m.id::text IN (r.payload->>'messageId',r.result->>'messageId')
          AND (r.payload<>jsonb_build_object('messageId',m.id,'erased',true) OR r.result<>'{"erased":true}'::jsonb))
      OR EXISTS (SELECT 1 FROM public.circle_message_ai_consents AS c WHERE c.message_id=m.id)
      OR EXISTS (SELECT 1 FROM public.circle_review_coverage_sessions AS c WHERE c.message_id=m.id AND NOT c.invalidated)
    )
  );
$$;

CREATE FUNCTION soe_account_deletion_private.erase_circle_posts(
  p_request uuid,p_member uuid,p_auth uuid,p_reviewed_scope jsonb,p_evidence_approved boolean
)
RETURNS timestamptz LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog SET lock_timeout = '3s' AS $$
DECLARE
  targets uuid[];
  scope jsonb;
  prior soe_account_deletion_private.circle_post_receipts%ROWTYPE;
  removed text := 'Removed with account deletion.';
  finished_at timestamptz;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Erase Circle posts in a read-committed transaction' USING ERRCODE = 'PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing AS p WHERE p.request_id=p_request
    AND p.member_id IS NOT DISTINCT FROM p_member AND p.auth_user_id IS NOT DISTINCT FROM p_auth
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE = 'PT409';
  END IF;
  LOCK TABLE public.seminar_messages,public.circle_message_states,public.circle_message_reports,
    public.circle_message_decisions,public.circle_message_receipts,public.circle_message_ai_consents,
    public.circle_review_coverage_sessions IN ROW EXCLUSIVE MODE;
  PERFORM soe_account_deletion_private.check_circle_post_erasure_shape();

  targets := soe_account_deletion_private.circle_posts_for_member(p_member);
  SELECT * INTO prior FROM soe_account_deletion_private.circle_post_receipts AS r WHERE r.request_id=p_request;
  IF FOUND THEN
    IF prior.reviewed_scope IS DISTINCT FROM p_reviewed_scope OR prior.evidence_approved IS DISTINCT FROM p_evidence_approved
       OR cardinality(targets)<>0 OR NOT soe_account_deletion_private.verify_circle_post_erasure(p_request)
       OR (SELECT count(*) FROM soe_account_deletion_private.circle_post_targets WHERE request_id=p_request)
          <> (prior.reviewed_scope->>'posts')::bigint THEN
      RAISE EXCEPTION 'Circle post erasure requires review' USING ERRCODE = 'PT409';
    END IF;
    RETURN prior.cleared_at;
  END IF;

  -- Normal discussion and review lock a Circle before its post rows.
  PERFORM 1 FROM public.book_cohorts AS c
    WHERE EXISTS (SELECT 1 FROM public.seminar_messages AS m WHERE m.id=ANY(targets) AND m.cohort_id=c.id)
    ORDER BY c.id FOR UPDATE;
  PERFORM 1 FROM public.seminar_messages AS m WHERE m.id=ANY(targets) ORDER BY m.id FOR UPDATE;
  scope := soe_account_deletion_private.circle_erasure_scope(targets);
  IF scope IS DISTINCT FROM p_reviewed_scope OR p_evidence_approved IS NULL OR (
    NOT p_evidence_approved AND ((scope->>'reports')::bigint+(scope->>'decisions')::bigint+(scope->>'receipts')::bigint)>0
  ) THEN
    RAISE EXCEPTION 'Review the current Circle posts and linked evidence' USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.circle_message_states AS s WHERE s.message_id=ANY(targets) AND s.revision>=9007199254740991)
  OR EXISTS (
    SELECT 1 FROM public.circle_message_receipts AS r
    WHERE EXISTS (SELECT 1 FROM unnest(targets) AS t(id) WHERE t.id::text IN (r.payload->>'messageId',r.result->>'messageId'))
      AND r.payload->>'messageId' IS NOT NULL AND r.result->>'messageId' IS NOT NULL
      AND r.payload->>'messageId'<>r.result->>'messageId'
  ) THEN
    RAISE EXCEPTION 'Circle evidence requires a new review' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO soe_account_deletion_private.circle_post_targets (request_id,message_id)
    SELECT p_request,id FROM unnest(targets) AS chosen(id);
  INSERT INTO soe_account_deletion_private.circle_post_context (tx,request_id) VALUES (pg_current_xact_id(),p_request);

  INSERT INTO public.circle_message_states AS s (message_id,cohort_id,withdrawn,hidden,revision)
    SELECT id,cohort_id,true,false,1 FROM public.seminar_messages WHERE id=ANY(targets)
    ON CONFLICT (message_id) DO UPDATE SET withdrawn=true,hidden=false,revision=s.revision+1;
  UPDATE public.circle_message_reports SET note=NULL,status=CASE WHEN status='open' THEN 'dismissed' ELSE status END
    WHERE message_id=ANY(targets);
  UPDATE public.circle_message_decisions SET summary=removed,evidence_report_id=NULL,
    evidence_excerpt=CASE WHEN action='hide' THEN removed END,content_hash=public._soe_circle_message_hash(removed)
    WHERE message_id=ANY(targets);
  UPDATE public.circle_message_receipts AS r SET
    payload=jsonb_build_object('messageId',coalesce(r.payload->>'messageId',r.result->>'messageId'),'erased',true),
    result='{"erased":true}'::jsonb
    WHERE EXISTS (SELECT 1 FROM unnest(targets) AS t(id) WHERE t.id::text IN (r.payload->>'messageId',r.result->>'messageId'));
  DELETE FROM public.circle_message_ai_consents WHERE message_id=ANY(targets);
  UPDATE public.seminar_messages SET member_id=NULL,member_name='Former member',sender_name=NULL,
    thinker_id=NULL,passage_reference=NULL,content=removed WHERE id=ANY(targets);

  IF cardinality(soe_account_deletion_private.circle_posts_for_member(p_member))<>0
     OR NOT soe_account_deletion_private.verify_circle_post_erasure(p_request) THEN
    RAISE EXCEPTION 'Circle post removal could not be verified' USING ERRCODE = 'PT409';
  END IF;
  DELETE FROM soe_account_deletion_private.circle_post_context WHERE tx=pg_current_xact_id();
  finished_at:=clock_timestamp();
  INSERT INTO soe_account_deletion_private.circle_post_receipts (request_id,reviewed_scope,evidence_approved,cleared_at)
    VALUES(p_request,scope,p_evidence_approved,finished_at);
  RETURN finished_at;
END;
$$;

REVOKE ALL ON FUNCTION
  soe_account_deletion_private.circle_post_in_context(text),
  soe_account_deletion_private.guard_circle_post_insert(),
  soe_account_deletion_private.guard_erased_circle_copy(),
  soe_account_deletion_private.check_circle_post_erasure_shape(),
  soe_account_deletion_private.circle_posts_for_member(uuid),
  soe_account_deletion_private.circle_erasure_scope(uuid[]),
  soe_account_deletion_private.preview_circle_posts(uuid,uuid,uuid),
  soe_account_deletion_private.verify_circle_post_erasure(uuid),
  soe_account_deletion_private.erase_circle_posts(uuid,uuid,uuid,jsonb,boolean)
FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  PERFORM soe_account_deletion_private.check_circle_post_erasure_shape();
  IF EXISTS (
    SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS caller(role_name)
    WHERE pg_has_role(role_name,current_user,'MEMBER')
      OR EXISTS (
        SELECT 1 FROM (VALUES ('circle_post_targets'),('circle_post_receipts'),('circle_post_context')) AS r(name)
        WHERE has_table_privilege(role_name,'soe_account_deletion_private.'||r.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      )
      OR EXISTS (
        SELECT 1 FROM pg_proc AS f JOIN pg_namespace AS n ON n.oid=f.pronamespace
        WHERE n.nspname='soe_account_deletion_private' AND f.proname IN (
          'circle_post_in_context','guard_circle_post_insert','guard_erased_circle_copy','check_circle_post_erasure_shape',
          'circle_posts_for_member','circle_erasure_scope','preview_circle_posts','verify_circle_post_erasure','erase_circle_posts'
        ) AND has_function_privilege(role_name,f.oid,'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected effective Circle post removal privileges';
  END IF;
END;
$$;

COMMIT;
