-- UNAPPLIED CANDIDATE: no live schema, grants, accounts or policies were changed.
-- Apply only to an authorized isolated restore after reviewing the preflight.
-- Requires the existing Circle migration and circle-moderation.sql. No reviewers
-- are provisioned. Service-only INVOKER RPCs use canonical server member IDs.
BEGIN;

-- Unknown policies/role inheritance must be reviewed, not silently normalized.
DO $$
DECLARE v_policy record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND (rolbypassrls OR rolsuper))
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    RAISE EXCEPTION 'Expected isolated service/browser roles are unavailable';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('anon','authenticated')) THEN
    RAISE EXCEPTION 'Unexpected browser authority: review role flags and inherited grants';
  END IF;
  -- Restrictive predicates consult public cohort classification. If a browser
  -- already has legacy child-table privileges but cannot read that table, stop
  -- for review rather than silently break its ordinary-salon operations.
  IF EXISTS (SELECT 1 FROM pg_roles browser WHERE browser.rolname IN ('anon','authenticated')
    AND NOT has_table_privilege(browser.oid,'public.book_cohorts','SELECT')
    AND (has_table_privilege(browser.oid,'public.seminar_messages','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(browser.oid,'public.book_cohort_members','SELECT,INSERT,UPDATE,DELETE'))) THEN
    RAISE EXCEPTION 'Unexpected legacy browser grants: cohort classification read requires review';
  END IF;
  FOR v_policy IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN ('book_cohorts','book_cohort_members','seminar_messages') LOOP
    IF NOT ((v_policy.tablename='book_cohorts' AND v_policy.policyname='Cohorts public read' AND v_policy.cmd='SELECT' AND v_policy.qual='true' AND v_policy.with_check IS NULL)
      OR (v_policy.tablename='book_cohorts' AND v_policy.policyname='Cohorts insert' AND v_policy.cmd='INSERT' AND v_policy.qual IS NULL AND v_policy.with_check='true')
      OR (v_policy.tablename='book_cohort_members' AND v_policy.policyname='Cohort members open' AND v_policy.cmd='ALL' AND v_policy.qual='true' AND v_policy.with_check='true')
      OR (v_policy.tablename='seminar_messages' AND v_policy.policyname='Seminar messages open' AND v_policy.cmd='ALL' AND v_policy.qual='true' AND v_policy.with_check='true'))
      OR v_policy.permissive <> 'PERMISSIVE' OR v_policy.roles <> ARRAY['public']::name[] THEN
      RAISE EXCEPTION 'Unknown legacy policy configuration: %.%',v_policy.tablename,v_policy.policyname;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('book_cohorts','book_cohort_members','seminar_messages')) <> 4
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='public' AND c.relname IN ('book_cohorts','book_cohort_members','seminar_messages')
      AND (NOT c.relrowsecurity OR r.rolname IN ('anon','authenticated'))) THEN
    RAISE EXCEPTION 'Unexpected legacy policy/ownership configuration';
  END IF;
END $$;

-- RLS does not govern TRUNCATE. Direct DML grants may exist in old deployments;
-- restrictive Circle-only policies below constrain them without changing salons.
REVOKE TRUNCATE ON public.book_cohorts, public.book_cohort_members, public.seminar_messages FROM PUBLIC, anon, authenticated;
CREATE POLICY circle_messages_browser_restrict ON public.seminar_messages AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING (NOT EXISTS (SELECT 1 FROM public.book_cohorts c WHERE c.id=cohort_id AND c.book_id='soe-circles-path'))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM public.book_cohorts c WHERE c.id=cohort_id AND c.book_id='soe-circles-path'));
CREATE POLICY circle_members_browser_restrict ON public.book_cohort_members AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING (NOT EXISTS (SELECT 1 FROM public.book_cohorts c WHERE c.id=cohort_id AND c.book_id='soe-circles-path'))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM public.book_cohorts c WHERE c.id=cohort_id AND c.book_id='soe-circles-path'));
CREATE POLICY circle_cohorts_browser_insert_restrict ON public.book_cohorts AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK (book_id <> 'soe-circles-path');
CREATE POLICY circle_cohorts_browser_update_restrict ON public.book_cohorts AS RESTRICTIVE FOR UPDATE TO anon,authenticated
  USING (book_id <> 'soe-circles-path') WITH CHECK (book_id <> 'soe-circles-path');
CREATE POLICY circle_cohorts_browser_delete_restrict ON public.book_cohorts AS RESTRICTIVE FOR DELETE TO anon,authenticated USING (book_id <> 'soe-circles-path');

CREATE TABLE public.circle_message_states (
  message_id uuid PRIMARY KEY REFERENCES public.seminar_messages(id) ON DELETE RESTRICT,
  cohort_id uuid NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  withdrawn boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE public.circle_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cohort_id uuid NOT NULL, message_id uuid NOT NULL,
  reporter_member_id uuid NOT NULL, reason text NOT NULL CHECK(reason IN ('safety','harassment','spam','misleading','inappropriate','other')),
  note text CHECK(note IS NULL OR length(note)<=1000), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX circle_message_reports_open ON public.circle_message_reports(message_id,status,created_at,id);
CREATE INDEX circle_message_reports_reporter ON public.circle_message_reports(cohort_id,reporter_member_id);
CREATE TABLE public.circle_message_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cohort_id uuid NOT NULL, message_id uuid NOT NULL,
  actor_member_id uuid NOT NULL, request_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('hide','restore')),
  reason text NOT NULL, summary text NOT NULL CHECK(length(btrim(summary)) BETWEEN 20 AND 1000 AND length(summary)<=1000),
  evidence_report_id uuid, evidence_excerpt text, content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  report_count integer NOT NULL CHECK(report_count BETWEEN 0 AND 100), revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(actor_member_id,request_id),
  CHECK ((action='hide' AND reason IN ('safety','harassment','spam','misleading','inappropriate') AND length(btrim(evidence_excerpt)) BETWEEN 5 AND 500)
    OR (action='restore' AND reason IN ('no_violation','insufficient_evidence','resolved') AND evidence_report_id IS NULL AND evidence_excerpt IS NULL))
);
CREATE INDEX circle_message_decisions_message ON public.circle_message_decisions(message_id,created_at DESC,id DESC);
CREATE TABLE public.circle_message_receipts (
  actor_member_id uuid NOT NULL, request_id uuid NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(actor_member_id,request_id)
);
ALTER TABLE public.circle_message_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_message_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_message_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.circle_message_states,public.circle_message_reports,public.circle_message_decisions,public.circle_message_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.circle_message_states,public.circle_message_reports TO service_role;
GRANT SELECT,INSERT ON public.circle_message_decisions,public.circle_message_receipts TO service_role;
GRANT SELECT,INSERT ON public.seminar_messages TO service_role;
GRANT UPDATE(id) ON public.seminar_messages TO service_role;
GRANT SELECT ON public.members,public.book_cohorts,public.book_cohort_members,public.circle_reports,public.circle_reviewer_grants TO service_role;
GRANT UPDATE(id) ON public.book_cohort_members TO service_role;

CREATE FUNCTION public._soe_circle_message_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_TABLE_NAME IN ('circle_message_decisions','circle_message_receipts') THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Safety history is immutable';
  END IF;
  IF TG_TABLE_NAME='book_cohorts' THEN
    IF OLD.book_id='soe-circles-path' AND NEW.book_id IS DISTINCT FROM OLD.book_id THEN
      RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Circle identity is immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM public.book_cohorts WHERE id=OLD.cohort_id AND book_id='soe-circles-path')
    OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.book_cohorts WHERE id=NEW.cohort_id AND book_id='soe-circles-path')) THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Circle posts are retained immutable evidence';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER circle_message_identity_immutable BEFORE UPDATE OR DELETE ON public.seminar_messages FOR EACH ROW EXECUTE FUNCTION public._soe_circle_message_immutable();
CREATE TRIGGER circle_cohort_identity_immutable BEFORE UPDATE OF book_id ON public.book_cohorts FOR EACH ROW EXECUTE FUNCTION public._soe_circle_message_immutable();
CREATE TRIGGER circle_message_decisions_immutable BEFORE UPDATE OR DELETE ON public.circle_message_decisions FOR EACH ROW EXECUTE FUNCTION public._soe_circle_message_immutable();
CREATE TRIGGER circle_message_receipts_immutable BEFORE UPDATE OR DELETE ON public.circle_message_receipts FOR EACH ROW EXECUTE FUNCTION public._soe_circle_message_immutable();

-- A cascading child DELETE runs after its parent row is gone; the child guard
-- cannot classify that deleted Circle reliably. Protect retention at the parent
-- boundary as well, including posts with no lazily initialized safety state.
CREATE FUNCTION public._soe_circle_message_parent_delete_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.book_id='soe-circles-path' AND EXISTS(SELECT 1 FROM public.seminar_messages WHERE cohort_id=OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Circle posts are retained immutable evidence';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER circle_message_parent_retention BEFORE DELETE ON public.book_cohorts FOR EACH ROW EXECUTE FUNCTION public._soe_circle_message_parent_delete_guard();

CREATE FUNCTION public._soe_circle_message_hash(p_content text) RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(p_content,'UTF8')),'hex');
$$;
CREATE FUNCTION public._soe_circle_message_visibility(p_hidden boolean,p_withdrawn boolean) RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN p_withdrawn THEN 'withdrawn' WHEN p_hidden THEN 'hidden' ELSE 'visible' END;
$$;
CREATE FUNCTION public._soe_circle_message_name(p_name text) RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN p_name IS NOT NULL AND length(btrim(p_name)) BETWEEN 1 AND 200 AND strpos(p_name,'@')=0
   AND p_name !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN btrim(p_name) ELSE 'Explorer' END;
$$;
-- This projection contains no reporter IDs, notes, excerpts or reviewer identity.
-- A human separately authors the explanation; text bounds cannot prevent a
-- malicious/negligent assigned reviewer disclosing private details in it.
CREATE FUNCTION public._soe_circle_message_project(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('circleId',m.cohort_id,'message',jsonb_build_object('id',m.id,'member_name',public._soe_circle_message_name(m.member_name),
   'content',CASE WHEN coalesce(s.hidden,false) OR coalesce(s.withdrawn,false) THEN NULL ELSE m.content END,
   'created_at',m.created_at,'is_mine',coalesce(m.member_id=p_actor,false),'visibility',public._soe_circle_message_visibility(coalesce(s.hidden,false),coalesce(s.withdrawn,false))),
   'revision',coalesce(s.revision,0),'contentHash',CASE WHEN m.member_id=p_actor OR (NOT coalesce(s.hidden,false) AND NOT coalesce(s.withdrawn,false)) THEN public._soe_circle_message_hash(m.content) ELSE NULL END,
   'canReport',m.member_id IS DISTINCT FROM p_actor AND NOT coalesce(s.hidden,false) AND NOT coalesce(s.withdrawn,false) AND NOT c.circle_hidden
     AND EXISTS(SELECT 1 FROM public.book_cohort_members x WHERE x.cohort_id=c.id AND x.member_id=p_actor),
   'canWithdraw',coalesce(m.member_id=p_actor,false) AND NOT coalesce(s.withdrawn,false),
   'explanations',CASE WHEN m.member_id=p_actor THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'action',d.action,'reason',d.reason,'summary',d.summary,'created_at',d.created_at) ORDER BY d.created_at DESC,d.id DESC),'[]'::jsonb)
     FROM (SELECT * FROM public.circle_message_decisions WHERE message_id=m.id ORDER BY created_at DESC,id DESC LIMIT 100) d) ELSE '[]'::jsonb END)
 FROM public.seminar_messages m JOIN public.book_cohorts c ON c.id=m.cohort_id LEFT JOIN public.circle_message_states s ON s.message_id=m.id
 WHERE m.id=p_message_id AND m.cohort_id=p_circle_id AND c.book_id='soe-circles-path';
$$;
CREATE FUNCTION public._soe_circle_message_lock(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS public.seminar_messages LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member access denied'; END IF;
  PERFORM 1 FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable'; END IF;
  SELECT * INTO m FROM public.seminar_messages WHERE id=p_message_id AND cohort_id=p_circle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Post unavailable'; END IF;
  -- Existing state is locked after cohort and post; reads never initialize it.
  PERFORM 1 FROM public.circle_message_states WHERE message_id=p_message_id FOR UPDATE;
  RETURN m;
END $$;
CREATE FUNCTION public._soe_circle_message_reviewer_allowed(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT p_actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.circle_reviewer_grants g JOIN public.book_cohorts c ON c.id=g.cohort_id JOIN public.seminar_messages m ON m.cohort_id=c.id
 WHERE c.id=p_circle_id AND m.id=p_message_id AND c.book_id='soe-circles-path' AND g.member_id=p_actor AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>clock_timestamp())
 AND c.created_by IS DISTINCT FROM p_actor AND m.member_id IS DISTINCT FROM p_actor
 AND NOT EXISTS(SELECT 1 FROM public.book_cohort_members x WHERE x.cohort_id=c.id AND x.member_id=p_actor)
 AND NOT EXISTS(SELECT 1 FROM public.circle_reports x WHERE x.cohort_id=c.id AND x.reporter_member_id=p_actor)
 AND NOT EXISTS(SELECT 1 FROM public.circle_message_reports x WHERE x.cohort_id=c.id AND x.reporter_member_id=p_actor));
$$;
CREATE FUNCTION public._soe_circle_message_review_authorize(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  -- Require some explicit scope before loading private post evidence.
  IF NOT EXISTS(SELECT 1 FROM public.circle_reviewer_grants WHERE cohort_id=p_circle_id AND member_id=p_actor AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Review access denied'; END IF;
  PERFORM public._soe_circle_message_lock(p_actor,p_circle_id,p_message_id);
  PERFORM 1 FROM public.circle_reviewer_grants WHERE cohort_id=p_circle_id AND member_id=p_actor AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
  IF NOT FOUND OR NOT public._soe_circle_message_reviewer_allowed(p_actor,p_circle_id,p_message_id) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Review access denied'; END IF;
END $$;

CREATE FUNCTION public.soe_circle_message_state(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages; h boolean;
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
  RETURN public._soe_circle_message_project(p_actor,p_circle_id,p_message_id);
END $$;

CREATE FUNCTION public.soe_circle_message_action(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_expected_revision bigint,p_content_hash text,p_request_id uuid,p_action text,p_reason text DEFAULT NULL,p_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
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

CREATE FUNCTION public.soe_circle_message_contributions(p_actor uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE items jsonb; more boolean; cursor_id uuid;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member access denied'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid page'; END IF;
 WITH page AS (SELECT m.id,m.cohort_id FROM public.seminar_messages m JOIN public.book_cohorts c ON c.id=m.cohort_id WHERE m.member_id=p_actor AND c.book_id='soe-circles-path' AND (p_after IS NULL OR m.id>p_after) ORDER BY m.id LIMIT p_limit+1),
 shown AS (SELECT * FROM page ORDER BY id LIMIT p_limit)
 SELECT coalesce(jsonb_agg(public._soe_circle_message_project(p_actor,cohort_id,id) ORDER BY id),'[]'::jsonb),(SELECT count(*)>p_limit FROM page),(SELECT id FROM shown ORDER BY id DESC LIMIT 1) INTO items,more,cursor_id FROM shown;
 RETURN jsonb_build_object('items',items,'nextCursor',CASE WHEN more THEN cursor_id ELSE NULL END);
END $$;

CREATE FUNCTION public.soe_circle_message_review_queue(p_actor uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE items jsonb; more boolean; cursor_id uuid;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid page'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.circle_reviewer_grants g WHERE g.member_id=p_actor AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>clock_timestamp()) AND g.cohort_id IN(SELECT id FROM public.book_cohorts WHERE book_id='soe-circles-path' AND created_by IS DISTINCT FROM p_actor)
   AND NOT EXISTS(SELECT 1 FROM public.book_cohort_members x WHERE x.cohort_id=g.cohort_id AND x.member_id=p_actor)
   AND NOT EXISTS(SELECT 1 FROM public.circle_reports x WHERE x.cohort_id=g.cohort_id AND x.reporter_member_id=p_actor)
   AND NOT EXISTS(SELECT 1 FROM public.circle_message_reports x WHERE x.cohort_id=g.cohort_id AND x.reporter_member_id=p_actor)) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Review access denied'; END IF;
 WITH eligible AS(SELECT m.id,m.cohort_id,c.title,coalesce(s.hidden,false) AS hidden,coalesce(s.withdrawn,false) AS withdrawn,coalesce(s.revision,0) AS revision,
   (SELECT count(*) FROM public.circle_message_reports r WHERE r.message_id=m.id AND r.status='open') AS reports
   FROM public.seminar_messages m JOIN public.book_cohorts c ON c.id=m.cohort_id LEFT JOIN public.circle_message_states s ON s.message_id=m.id
   WHERE (p_after IS NULL OR m.id>p_after) AND public._soe_circle_message_reviewer_allowed(p_actor,c.id,m.id)),
 page AS(SELECT * FROM eligible WHERE hidden OR reports>0 ORDER BY id LIMIT p_limit+1),shown AS(SELECT * FROM page ORDER BY id LIMIT p_limit)
 SELECT coalesce(jsonb_agg(jsonb_build_object('circleId',cohort_id,'messageId',id,'circleTitle',title,'visibility',public._soe_circle_message_visibility(hidden,withdrawn),'openReports',reports,'revision',revision) ORDER BY id),'[]'::jsonb),
 (SELECT count(*)>p_limit FROM page),(SELECT id FROM shown ORDER BY id DESC LIMIT 1) INTO items,more,cursor_id FROM shown;
 RETURN jsonb_build_object('items',items,'nextCursor',CASE WHEN more THEN cursor_id ELSE NULL END);
END $$;
CREATE FUNCTION public.soe_circle_message_review_detail(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE detail jsonb; reports jsonb; decisions jsonb; n bigint;
BEGIN
 PERFORM public._soe_circle_message_review_authorize(p_actor,p_circle_id,p_message_id);
 SELECT jsonb_build_object('circle',jsonb_build_object('id',c.id,'title',c.title),'message',jsonb_build_object('id',m.id,'member_name',public._soe_circle_message_name(m.member_name),'content',m.content,'created_at',m.created_at,'visibility',public._soe_circle_message_visibility(coalesce(s.hidden,false),coalesce(s.withdrawn,false))),
 'revision',coalesce(s.revision,0),'contentHash',public._soe_circle_message_hash(m.content)) INTO detail FROM public.seminar_messages m JOIN public.book_cohorts c ON c.id=m.cohort_id LEFT JOIN public.circle_message_states s ON s.message_id=m.id WHERE m.id=p_message_id;
 SELECT count(*) INTO n FROM public.circle_message_reports WHERE message_id=p_message_id AND status='open';
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'reason',reason,'note',note,'created_at',created_at) ORDER BY created_at,id),'[]'::jsonb) INTO reports FROM(SELECT * FROM public.circle_message_reports WHERE message_id=p_message_id AND status='open' ORDER BY created_at,id LIMIT 100) r;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'action',action,'reason',reason,'summary',summary,'created_at',created_at,'report_count',report_count) ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO decisions FROM(SELECT * FROM public.circle_message_decisions WHERE message_id=p_message_id ORDER BY created_at DESC,id DESC LIMIT 100) d;
 RETURN detail||jsonb_build_object('reports',reports,'decisions',decisions,'complete',n<=100);
END $$;
CREATE FUNCTION public.soe_circle_message_review_decide(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_expected_revision bigint,p_content_hash text,p_request_id uuid,p_action text,p_reason text,p_summary text,p_evidence_report_id uuid DEFAULT NULL,p_evidence_excerpt text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages; s public.circle_message_states; prior public.circle_message_receipts; payload jsonb; result jsonb; d public.circle_message_decisions; n integer; source_text text;
BEGIN
 PERFORM public._soe_circle_message_review_authorize(p_actor,p_circle_id,p_message_id);
 SELECT * INTO m FROM public.seminar_messages WHERE id=p_message_id;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 OR p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$'
 OR p_action IS NULL OR p_action NOT IN('hide','restore') OR p_reason IS NULL OR p_summary IS NULL OR length(btrim(p_summary)) NOT BETWEEN 20 AND 1000 OR length(p_summary)>1000
 OR (p_action='hide' AND (p_reason NOT IN('safety','harassment','spam','misleading','inappropriate') OR p_evidence_excerpt IS NULL OR length(btrim(p_evidence_excerpt)) NOT BETWEEN 5 AND 500 OR length(p_evidence_excerpt)>500))
 OR (p_action='restore' AND (p_reason NOT IN('no_violation','insufficient_evidence','resolved') OR p_evidence_report_id IS NOT NULL OR p_evidence_excerpt IS NOT NULL)) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid review decision'; END IF;
 payload:=jsonb_build_object('circleId',p_circle_id,'messageId',p_message_id,'expectedRevision',p_expected_revision,'contentHash',p_content_hash,'action',p_action,'reason',p_reason,'summary',p_summary,'evidenceReportId',p_evidence_report_id,'evidenceExcerpt',p_evidence_excerpt);
 SELECT * INTO prior FROM public.circle_message_receipts WHERE actor_member_id=p_actor AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request conflicts'; END IF;
  SELECT * INTO s FROM public.circle_message_states WHERE message_id=p_message_id;
  RETURN prior.result||jsonb_build_object('safety',jsonb_build_object('revision',coalesce(s.revision,0),'visibility',public._soe_circle_message_visibility(coalesce(s.hidden,false),coalesce(s.withdrawn,false))),'replayed',true);
 END IF;
 SELECT * INTO s FROM public.circle_message_states WHERE message_id=p_message_id;
 IF coalesce(s.revision,0)<>p_expected_revision OR p_content_hash<>public._soe_circle_message_hash(m.content) OR coalesce(s.revision,0)>=9007199254740991 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Post snapshot changed'; END IF;
 SELECT count(*) INTO n FROM public.circle_message_reports WHERE message_id=p_message_id AND status='open';
 IF n>100 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review snapshot incomplete'; END IF;
 IF p_action='hide' THEN
  IF p_evidence_report_id IS NULL THEN source_text:=m.content; ELSE SELECT note INTO source_text FROM public.circle_message_reports WHERE id=p_evidence_report_id AND message_id=p_message_id AND status='open'; END IF;
  IF source_text IS NULL OR strpos(source_text,p_evidence_excerpt)=0 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Evidence must match the reviewed source'; END IF;
 END IF;
 INSERT INTO public.circle_message_states(message_id,cohort_id) VALUES(p_message_id,p_circle_id) ON CONFLICT(message_id) DO NOTHING;
 UPDATE public.circle_message_states SET hidden=(p_action='hide'),revision=revision+1 WHERE message_id=p_message_id RETURNING * INTO s;
 UPDATE public.circle_message_reports SET status=CASE WHEN p_action='hide' THEN 'reviewed' ELSE 'dismissed' END WHERE message_id=p_message_id AND status='open';
 BEGIN
  INSERT INTO public.circle_message_decisions(cohort_id,message_id,actor_member_id,request_id,action,reason,summary,evidence_report_id,evidence_excerpt,content_hash,report_count,revision)
  VALUES(p_circle_id,p_message_id,p_actor,p_request_id,p_action,p_reason,btrim(p_summary),p_evidence_report_id,p_evidence_excerpt,p_content_hash,n,s.revision) RETURNING * INTO d;
  result:=jsonb_build_object('requestId',p_request_id,'circleId',p_circle_id,'messageId',p_message_id,'decision',jsonb_build_object('id',d.id,'action',d.action,'reason',d.reason,'summary',d.summary,'created_at',d.created_at,'report_count',d.report_count));
  INSERT INTO public.circle_message_receipts(actor_member_id,request_id,payload,result) VALUES(p_actor,p_request_id,payload,result);
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request conflicts'; END;
 RETURN result||jsonb_build_object('safety',jsonb_build_object('revision',s.revision,'visibility',public._soe_circle_message_visibility(s.hidden,s.withdrawn)),'replayed',false);
END $$;

CREATE FUNCTION public.soe_circle_messages_read(p_actor uuid,p_circle_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE cohort jsonb; members jsonb; messages jsonb; truncated boolean;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member access denied'; END IF;
 SELECT jsonb_build_object('id',id,'book_id',book_id,'title',title,'description',description,'max_members',max_members,'start_date',start_date,'thinker_id',thinker_id,'status',status,'created_at',created_at) INTO cohort FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' AND NOT circle_hidden FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=p_circle_id AND member_id=p_actor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Current membership required'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'members',jsonb_build_object('display_name',m.display_name)) ORDER BY x.joined_at,x.id),'[]'::jsonb) INTO members FROM public.book_cohort_members x LEFT JOIN public.members m ON m.id=x.member_id WHERE x.cohort_id=p_circle_id;
 WITH page AS(SELECT m.*,coalesce(s.hidden,false) AS hidden,coalesce(s.withdrawn,false) AS withdrawn FROM public.seminar_messages m LEFT JOIN public.circle_message_states s ON s.message_id=m.id WHERE m.cohort_id=p_circle_id ORDER BY m.created_at DESC,m.id DESC LIMIT 101),shown AS(SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT 100)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'member_name',public._soe_circle_message_name(member_name),'content',CASE WHEN withdrawn THEN '[Post withdrawn by its author.]' WHEN hidden THEN '[Post hidden after human review.]' ELSE content END,'created_at',created_at,'is_mine',coalesce(member_id=p_actor,false),'visibility',public._soe_circle_message_visibility(hidden,withdrawn)) ORDER BY created_at,id),'[]'::jsonb),(SELECT count(*)>100 FROM page) INTO messages,truncated FROM shown;
 RETURN jsonb_build_object('cohort',cohort,'members',members,'messages',messages,'history',jsonb_build_object('truncated',truncated,'limit',100));
END $$;
CREATE FUNCTION public.soe_circle_messages_post(p_actor uuid,p_circle_id uuid,p_content text,p_member_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE m public.seminar_messages; name text;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member access denied'; END IF;
 IF p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 1 AND 2000 OR length(p_content)>2000 OR p_content ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid post'; END IF;
 PERFORM 1 FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' AND NOT circle_hidden FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=p_circle_id AND member_id=p_actor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Current membership required'; END IF;
 name:=public._soe_circle_message_name(p_member_name);
 INSERT INTO public.seminar_messages(cohort_id,member_id,member_name,content) VALUES(p_circle_id,p_actor,name,btrim(p_content)) RETURNING * INTO m;
 RETURN jsonb_build_object('outcome','confirmed','circleId',p_circle_id,'message',jsonb_build_object('id',m.id,'member_name',m.member_name,'content',m.content,'created_at',m.created_at,'is_mine',true,'visibility','visible'));
END $$;

-- Include helpers: no function in this candidate is a browser authority surface.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'soe_circle_message%' OR p.proname LIKE '_soe_circle_message%') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
 END LOOP;
END $$;
COMMIT;
