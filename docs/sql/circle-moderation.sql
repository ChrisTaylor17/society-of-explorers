-- UNAPPLIED SCHEMA CANDIDATE. Review against current source, grants and migrations
-- before an authorized isolated restore or deployment. This file provisions no
-- reviewer and changes no live database. Existing cohort/Data API policy review
-- remains a separate release gate. All RPCs run as the invoking service role.
BEGIN;

ALTER TABLE public.book_cohorts ADD COLUMN IF NOT EXISTS circle_review_revision bigint NOT NULL DEFAULT 0
  CHECK (circle_review_revision BETWEEN 0 AND 9007199254740991);

CREATE TABLE public.circle_reviewer_grants (
  cohort_id uuid NOT NULL REFERENCES public.book_cohorts(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  expires_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (cohort_id, member_id)
);

-- Preserve the actor/Circle audit identifiers if the underlying account/Circle
-- is later removed. Retention/erasure needs its own reviewed operational policy.
CREATE TABLE public.circle_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL,
  actor_member_id uuid NOT NULL,
  request_id uuid NOT NULL,
  payload jsonb NOT NULL,
  action text NOT NULL CHECK (action IN ('hide', 'restore')),
  reason text NOT NULL,
  -- Deliberately authored host-facing explanation; length/plain text cannot
  -- guarantee a reviewer will not include private information. UI confirmation
  -- and reviewer practice are required. Raw evidence is never auto-projected.
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 20 AND 1000),
  evidence_report_id uuid,
  evidence_excerpt text,
  report_count integer NOT NULL CHECK (report_count BETWEEN 0 AND 100),
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  hidden boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (actor_member_id, request_id),
  CHECK ((action = 'hide' AND reason IN ('safety', 'harassment', 'spam', 'misleading')
    AND evidence_excerpt IS NOT NULL AND length(btrim(evidence_excerpt)) BETWEEN 5 AND 500 AND hidden)
    OR (action = 'restore' AND reason IN ('no_violation', 'insufficient_evidence', 'resolved')
      AND evidence_report_id IS NULL AND evidence_excerpt IS NULL AND NOT hidden))
);
CREATE INDEX circle_review_decisions_circle ON public.circle_review_decisions(cohort_id, created_at DESC, id DESC);
CREATE INDEX circle_reviewer_grants_member ON public.circle_reviewer_grants(member_id, cohort_id);
CREATE INDEX circle_reports_known_reporter ON public.circle_reports(cohort_id, reporter_member_id) WHERE reporter_member_id IS NOT NULL;
CREATE TABLE public.circle_report_receipts (
  request_id uuid PRIMARY KEY,
  actor_member_id uuid,
  reporter_key text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.circle_reviewer_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_report_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.circle_reviewer_grants, public.circle_review_decisions, public.circle_report_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.circle_reviewer_grants TO service_role;
-- PostgreSQL requires an UPDATE privilege for SELECT ... FOR SHARE. This narrow
-- column privilege supports locking; no public function provisions/revokes grants.
GRANT UPDATE (revoked_at) ON public.circle_reviewer_grants TO service_role;
GRANT SELECT, INSERT ON public.circle_review_decisions, public.circle_report_receipts TO service_role;
-- Existing objects need explicit service privileges too; anon/authenticated get
-- no new access. SECURITY INVOKER does not supply missing table privileges.
GRANT SELECT, UPDATE ON public.book_cohorts TO service_role;
GRANT SELECT ON public.members, public.book_cohort_members TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.circle_reports TO service_role;

CREATE FUNCTION public._soe_circle_review_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Review history is immutable';
END;
$$;
CREATE TRIGGER circle_review_decisions_immutable BEFORE UPDATE OR DELETE ON public.circle_review_decisions
  FOR EACH ROW EXECUTE FUNCTION public._soe_circle_review_immutable();

-- A permission predicate for bounded queue projection, not a grant creator.
CREATE FUNCTION public._soe_circle_reviewer_allowed(p_actor uuid, p_circle_id uuid) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  SELECT p_actor IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.circle_reviewer_grants g
    JOIN public.book_cohorts c ON c.id = g.cohort_id
    WHERE g.member_id = p_actor AND c.id = p_circle_id AND c.book_id = 'soe-circles-path'
      AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())
      AND c.created_by IS DISTINCT FROM p_actor
      AND NOT EXISTS (SELECT 1 FROM public.book_cohort_members m WHERE m.cohort_id = c.id AND m.member_id = p_actor)
      AND NOT EXISTS (SELECT 1 FROM public.circle_reports r WHERE r.cohort_id = c.id AND r.reporter_member_id = p_actor)
  );
$$;

-- Every detail/decision locks the same cohort as report submission, followed by
-- its grant. Revocation cannot commit during the protected decision transaction.
CREATE FUNCTION public._soe_circle_review_authorize(p_actor uuid, p_circle_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Review access denied'; END IF;
  -- Require scope before loading private reports or revealing a Circle's state.
  PERFORM 1 FROM public.circle_reviewer_grants g WHERE g.cohort_id = p_circle_id AND g.member_id = p_actor
    AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp());
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Review access denied'; END IF;
  PERFORM 1 FROM public.book_cohorts WHERE id = p_circle_id AND book_id = 'soe-circles-path' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Circle unavailable'; END IF;
  PERFORM 1 FROM public.circle_reviewer_grants g WHERE g.cohort_id = p_circle_id AND g.member_id = p_actor
    AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp()) FOR SHARE;
  IF NOT FOUND OR NOT public._soe_circle_reviewer_allowed(p_actor, p_circle_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Review access denied';
  END IF;
END;
$$;

CREATE FUNCTION public.soe_circle_review_queue(p_actor uuid, p_after uuid DEFAULT NULL, p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_items jsonb; v_more boolean; v_cursor uuid;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid queue limit'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.circle_reviewer_grants g WHERE g.member_id = p_actor
      AND public._soe_circle_reviewer_allowed(p_actor, g.cohort_id)) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Review access denied';
  END IF;
  WITH eligible AS (
    SELECT c.id, c.title, c.circle_hidden AS hidden, c.circle_review_revision AS revision,
      (SELECT count(*) FROM public.circle_reports r WHERE r.cohort_id = c.id AND r.status = 'open') AS reports
    FROM public.book_cohorts c WHERE c.book_id = 'soe-circles-path'
      AND (p_after IS NULL OR c.id > p_after) AND public._soe_circle_reviewer_allowed(p_actor, c.id)
  ), page AS (SELECT * FROM eligible WHERE hidden OR reports > 0 ORDER BY id LIMIT p_limit + 1),
  shown AS (SELECT * FROM page ORDER BY id LIMIT p_limit)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'hidden', hidden,
    'openReports', reports, 'revision', revision) ORDER BY id), '[]'::jsonb),
    (SELECT count(*) > p_limit FROM page), (SELECT id FROM shown ORDER BY id DESC LIMIT 1)
  INTO v_items, v_more, v_cursor FROM shown;
  RETURN jsonb_build_object('items', v_items, 'nextCursor', CASE WHEN v_more THEN v_cursor ELSE NULL END);
END;
$$;

CREATE FUNCTION public.soe_circle_review_detail(p_actor uuid, p_circle_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_circle jsonb; v_revision bigint; v_reports jsonb; v_decisions jsonb; v_count integer;
BEGIN
  PERFORM public._soe_circle_review_authorize(p_actor, p_circle_id);
  SELECT jsonb_build_object('id', id, 'title', title, 'description', description, 'hidden', circle_hidden), circle_review_revision
    INTO v_circle, v_revision FROM public.book_cohorts WHERE id = p_circle_id;
  SELECT count(*) INTO v_count FROM public.circle_reports WHERE cohort_id = p_circle_id AND status = 'open';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'reason', reason, 'note', note, 'created_at', created_at)
    ORDER BY created_at, id), '[]'::jsonb) INTO v_reports FROM (
      SELECT id, reason, note, created_at FROM public.circle_reports WHERE cohort_id = p_circle_id AND status = 'open'
      ORDER BY created_at, id LIMIT 100) r;
  -- History is newest 100; complete describes only the current report snapshot.
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'action', action, 'reason', reason, 'summary', summary,
    'created_at', created_at, 'report_count', report_count) ORDER BY created_at DESC, id DESC), '[]'::jsonb)
    INTO v_decisions FROM (SELECT * FROM public.circle_review_decisions WHERE cohort_id = p_circle_id ORDER BY created_at DESC, id DESC LIMIT 100) d;
  RETURN jsonb_build_object('circle', v_circle, 'revision', v_revision, 'reports', v_reports,
    'decisions', v_decisions, 'complete', v_count <= 100);
END;
$$;

CREATE FUNCTION public.soe_circle_review_decide(p_actor uuid, p_circle_id uuid, p_expected_revision bigint,
  p_request_id uuid, p_action text, p_reason text, p_summary text,
  p_evidence_report_id uuid DEFAULT NULL, p_evidence_excerpt text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_payload jsonb; v_prior public.circle_review_decisions; v_current bigint; v_next bigint;
  v_count integer; v_source text; v_decision public.circle_review_decisions; v_public jsonb;
BEGIN
  PERFORM public._soe_circle_review_authorize(p_actor, p_circle_id);
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 OR p_expected_revision > 9007199254740991
    OR p_action IS NULL OR p_action NOT IN ('hide', 'restore') OR p_reason IS NULL
    OR p_summary IS NULL OR length(btrim(p_summary)) NOT BETWEEN 20 AND 1000
    OR length(p_summary) > 1000 THEN RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid review decision'; END IF;
  IF (p_action = 'hide' AND (p_reason NOT IN ('safety', 'harassment', 'spam', 'misleading')
       OR p_evidence_excerpt IS NULL OR length(btrim(p_evidence_excerpt)) NOT BETWEEN 5 AND 500 OR length(p_evidence_excerpt) > 500))
    OR (p_action = 'restore' AND (p_reason NOT IN ('no_violation', 'insufficient_evidence', 'resolved')
       OR p_evidence_report_id IS NOT NULL OR p_evidence_excerpt IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid review decision';
  END IF;
  v_payload := jsonb_build_object('circleId', p_circle_id, 'expectedRevision', p_expected_revision,
    'action', p_action, 'reason', p_reason, 'summary', p_summary, 'evidenceReportId', p_evidence_report_id, 'evidenceExcerpt', p_evidence_excerpt);
  SELECT * INTO v_prior FROM public.circle_review_decisions WHERE actor_member_id = p_actor AND request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Review request conflicts'; END IF;
    v_public := jsonb_build_object('id', v_prior.id, 'action', v_prior.action, 'reason', v_prior.reason, 'summary', v_prior.summary,
      'created_at', v_prior.created_at, 'report_count', v_prior.report_count);
    SELECT circle_review_revision INTO v_current FROM public.book_cohorts WHERE id = p_circle_id;
    RETURN jsonb_build_object('decision', v_public, 'revision', v_current,
      'hidden', (SELECT circle_hidden FROM public.book_cohorts WHERE id = p_circle_id), 'replayed', true);
  END IF;
  SELECT circle_review_revision INTO v_current FROM public.book_cohorts WHERE id = p_circle_id;
  IF v_current <> p_expected_revision OR v_current >= 9007199254740991 THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Review snapshot changed'; END IF;
  SELECT count(*) INTO v_count FROM public.circle_reports WHERE cohort_id = p_circle_id AND status = 'open';
  IF v_count > 100 THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Review snapshot incomplete'; END IF;
  IF p_action = 'hide' THEN
    IF p_evidence_report_id IS NOT NULL THEN
      SELECT note INTO v_source FROM public.circle_reports WHERE id = p_evidence_report_id AND cohort_id = p_circle_id AND status = 'open';
    ELSE
      SELECT CASE WHEN strpos(title, p_evidence_excerpt) > 0 THEN title ELSE description END
        INTO v_source FROM public.book_cohorts WHERE id = p_circle_id;
    END IF;
    IF v_source IS NULL OR strpos(v_source, p_evidence_excerpt) = 0 THEN RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Evidence must match the reviewed source'; END IF;
  END IF;
  v_next := v_current + 1;
  UPDATE public.book_cohorts SET circle_hidden = (p_action = 'hide'), circle_review_revision = v_next WHERE id = p_circle_id;
  UPDATE public.circle_reports SET status = CASE WHEN p_action = 'hide' THEN 'reviewed' ELSE 'dismissed' END
    WHERE cohort_id = p_circle_id AND status = 'open';
  BEGIN
    INSERT INTO public.circle_review_decisions(cohort_id, actor_member_id, request_id, payload, action, reason, summary,
      evidence_report_id, evidence_excerpt, report_count, revision, hidden)
    VALUES (p_circle_id, p_actor, p_request_id, v_payload, p_action, p_reason, btrim(p_summary),
      p_evidence_report_id, p_evidence_excerpt, v_count, v_next, p_action = 'hide') RETURNING * INTO v_decision;
  EXCEPTION WHEN unique_violation THEN
    -- Different Circles use different parent locks. A cross-Circle request-key
    -- collision must still roll back this entire decision and return conflict.
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Review request conflicts';
  END;
  v_public := jsonb_build_object('id', v_decision.id, 'action', v_decision.action, 'reason', v_decision.reason, 'summary', v_decision.summary,
    'created_at', v_decision.created_at, 'report_count', v_decision.report_count);
  RETURN jsonb_build_object('decision', v_public, 'revision', v_next, 'hidden', v_decision.hidden, 'replayed', false);
END;
$$;

CREATE FUNCTION public.soe_circle_host_review(p_actor uuid, p_circle_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_circle jsonb; v_decisions jsonb;
BEGIN
  SELECT jsonb_build_object('id', id, 'title', title, 'hidden', circle_hidden) INTO v_circle
    FROM public.book_cohorts WHERE id = p_circle_id AND book_id = 'soe-circles-path' AND created_by = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Hosted circle unavailable'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'action', action, 'reason', reason, 'summary', summary, 'created_at', created_at)
    ORDER BY created_at DESC, id DESC), '[]'::jsonb) INTO v_decisions FROM (
      SELECT * FROM public.circle_review_decisions WHERE cohort_id = p_circle_id ORDER BY created_at DESC, id DESC LIMIT 100) d;
  RETURN jsonb_build_object('circle', v_circle, 'decisions', v_decisions);
END;
$$;

CREATE FUNCTION public.soe_circle_host_reviews(p_actor uuid, p_after uuid DEFAULT NULL, p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_items jsonb; v_more boolean; v_cursor uuid;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Host access denied'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid queue limit'; END IF;
  WITH page AS (SELECT id FROM public.book_cohorts WHERE created_by = p_actor AND book_id = 'soe-circles-path'
    AND (p_after IS NULL OR id > p_after) ORDER BY id LIMIT p_limit + 1),
  shown AS (SELECT id FROM page ORDER BY id LIMIT p_limit)
  SELECT coalesce(jsonb_agg(public.soe_circle_host_review(p_actor, id) ORDER BY id), '[]'::jsonb),
    (SELECT count(*) > p_limit FROM page), (SELECT id FROM shown ORDER BY id DESC LIMIT 1)
    INTO v_items, v_more, v_cursor FROM shown;
  RETURN jsonb_build_object('items', v_items, 'nextCursor', CASE WHEN v_more THEN v_cursor ELSE NULL END);
END;
$$;

CREATE FUNCTION public.soe_circle_report(p_actor uuid, p_reporter_key text, p_circle_id uuid, p_reason text, p_note text, p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_note text := nullif(btrim(p_note), ''); v_revision bigint; v_count integer;
  v_payload jsonb; v_prior public.circle_report_receipts;
BEGIN
  IF p_request_id IS NULL OR p_reason IS NULL OR p_reason NOT IN ('safety', 'harassment', 'spam', 'misleading', 'inappropriate', 'other')
    OR (p_note IS NOT NULL AND length(p_note) > 1000)
    OR (p_actor IS NULL AND (p_reporter_key IS NULL OR p_reporter_key !~ '^[a-f0-9]{32}$'))
    OR (p_actor IS NOT NULL AND p_reporter_key IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid report';
  END IF;
  IF p_actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_actor) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Report access denied';
  END IF;
  SELECT circle_review_revision INTO v_revision FROM public.book_cohorts WHERE id = p_circle_id AND book_id = 'soe-circles-path' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Circle unavailable'; END IF;
  v_payload := jsonb_build_object('circleId', p_circle_id, 'reason', p_reason, 'note', p_note);
  SELECT * INTO v_prior FROM public.circle_report_receipts WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.actor_member_id IS DISTINCT FROM p_actor OR v_prior.reporter_key IS DISTINCT FROM p_reporter_key
      OR v_prior.payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Report request conflicts'; END IF;
    RETURN jsonb_build_object('received', true);
  END IF;
  -- A receipt survives review: replay cannot rehide a restored Circle. A new
  -- explicit key after closure may report later harm, even with the same note.
  BEGIN
    INSERT INTO public.circle_report_receipts(request_id, actor_member_id, reporter_key, payload)
      VALUES (p_request_id, p_actor, p_reporter_key, v_payload);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Report request conflicts';
  END;
  IF EXISTS (SELECT 1 FROM public.circle_reports WHERE cohort_id = p_circle_id
      AND ((p_actor IS NOT NULL AND reporter_member_id = p_actor) OR (p_actor IS NULL AND reporter_member_id IS NULL AND reporter_key = p_reporter_key))
      AND status = 'open' AND reason = p_reason AND note IS NOT DISTINCT FROM v_note) THEN
    RETURN jsonb_build_object('received', true);
  END IF;
  -- New evidence from the same source is retained in a separate report row;
  -- the threshold below still counts that source only once.
  IF v_revision >= 9007199254740991 THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Review snapshot changed'; END IF;
  INSERT INTO public.circle_reports(cohort_id, reporter_member_id, reporter_key, reason, note, status)
    VALUES (p_circle_id, p_actor, p_reporter_key, p_reason, v_note, 'open');
  SELECT count(*) INTO v_count FROM (SELECT DISTINCT CASE WHEN reporter_member_id IS NOT NULL THEN 'member:' || reporter_member_id::text
    ELSE 'key:' || reporter_key END AS reporter FROM public.circle_reports WHERE cohort_id = p_circle_id AND status = 'open') r;
  UPDATE public.book_cohorts SET circle_review_revision = v_revision + 1,
    circle_hidden = circle_hidden OR v_count >= 3 WHERE id = p_circle_id;
  RETURN jsonb_build_object('received', true);
END;
$$;

-- No browser role may invoke even a read RPC or helper. The trusted server
-- derives p_actor from the canonical verified member; the RPC rechecks grants.
REVOKE ALL ON FUNCTION public._soe_circle_review_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._soe_circle_reviewer_allowed(uuid, uuid), public._soe_circle_review_authorize(uuid, uuid),
  public.soe_circle_review_queue(uuid, uuid, integer), public.soe_circle_review_detail(uuid, uuid),
  public.soe_circle_review_decide(uuid, uuid, bigint, uuid, text, text, text, uuid, text),
  public.soe_circle_host_review(uuid, uuid), public.soe_circle_host_reviews(uuid, uuid, integer),
  public.soe_circle_report(uuid, text, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._soe_circle_reviewer_allowed(uuid, uuid), public._soe_circle_review_authorize(uuid, uuid),
  public.soe_circle_review_queue(uuid, uuid, integer), public.soe_circle_review_detail(uuid, uuid),
  public.soe_circle_review_decide(uuid, uuid, bigint, uuid, text, text, text, uuid, text),
  public.soe_circle_host_review(uuid, uuid), public.soe_circle_host_reviews(uuid, uuid, integer),
  public.soe_circle_report(uuid, text, uuid, text, text, uuid) TO service_role;
COMMIT;
