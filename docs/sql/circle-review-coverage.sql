-- UNAPPLIED LOCAL CANDIDATE. No reviewer, live access or deployment approval.
-- Bounded pages + explicit acknowledgements demonstrate presentation, not human comprehension.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;
DO $preflight$
DECLARE n text; c record;
BEGIN
 IF current_user IN('anon','authenticated','service_role') OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
 OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
 OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN('anon','authenticated'))
 OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review coverage owner or role authority requires review';
 END IF;
 IF to_regclass('public.circle_review_coverage_sessions') IS NOT NULL OR to_regclass('public.circle_review_coverage_pages') IS NOT NULL
 OR to_regclass('public.circle_review_coverage_actor') IS NOT NULL OR to_regclass('public.circle_review_coverage_active_case') IS NOT NULL
 OR to_regclass('public.circle_review_coverage_listing_order') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'soe_circle_review_coverage_%' OR proname LIKE '_soe_circle_review_coverage_%')) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review coverage objects already exist';
 END IF;
 FOREACH n IN ARRAY ARRAY['book_cohorts','seminar_messages','circle_reports','circle_message_reports','circle_message_states','circle_reviewer_grants','circle_review_decisions','circle_message_decisions','circle_message_receipts'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||n) AND relkind='r' AND pg_get_userbyid(relowner)=current_user) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review coverage prerequisites require review';
  END IF;
 END LOOP;
 FOREACH n IN ARRAY ARRAY['_soe_circle_review_authorize(uuid,uuid)','_soe_circle_message_review_authorize(uuid,uuid,uuid)'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||n) AND NOT prosecdef AND pg_get_userbyid(proowner)=current_user) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review coverage authorization requires review';
  END IF;
 END LOOP;
 FOREACH n IN ARRAY ARRAY['circle_review_decisions','circle_message_decisions'] LOOP
  SELECT x.* INTO c FROM pg_constraint x WHERE x.conrelid=('public.'||n)::regclass AND x.conname=n||'_report_count_check';
  IF NOT FOUND OR c.contype<>'c' OR NOT c.convalidated OR c.connoinherit
   OR regexp_replace(pg_get_expr(c.conbin,c.conrelid),'[()[:space:]]','','g')<>'report_count>=0ANDreport_count<=100'
   OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=c.conrelid AND attname='report_count' AND atttypid='integer'::regtype AND attnotnull AND NOT attisdropped)
   OR EXISTS(SELECT 1 FROM pg_constraint other JOIN pg_attribute a ON a.attrelid=other.conrelid AND a.attname='report_count' WHERE other.conrelid=c.conrelid AND other.contype='c' AND other.oid<>c.oid AND a.attnum=ANY(other.conkey)) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review count constraint requires review';
  END IF;
 END LOOP;
END $preflight$;
-- Integer storage already bounds the maximum at 2147483647; old decision guards remain unchanged.
ALTER TABLE public.circle_review_decisions DROP CONSTRAINT circle_review_decisions_report_count_check;
ALTER TABLE public.circle_review_decisions ADD CONSTRAINT circle_review_decisions_report_count_check CHECK(report_count>=0);
ALTER TABLE public.circle_message_decisions DROP CONSTRAINT circle_message_decisions_report_count_check;
ALTER TABLE public.circle_message_decisions ADD CONSTRAINT circle_message_decisions_report_count_check CHECK(report_count>=0);
CREATE TABLE public.circle_review_coverage_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, circle_id uuid NOT NULL, message_id uuid,
 revision bigint NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991), content_hash text,
 source_hash text NOT NULL, total_reports integer NOT NULL CHECK(total_reports>=0), reviewed_reports integer NOT NULL DEFAULT 0,
 frontier integer NOT NULL DEFAULT 1 CHECK(frontier>=1), expires_at timestamptz NOT NULL,
 invalidated boolean NOT NULL DEFAULT false, used_request_id uuid,
 CHECK(reviewed_reports BETWEEN 0 AND total_reports),
 CHECK((message_id IS NULL AND content_hash IS NULL) OR (message_id IS NOT NULL AND content_hash ~ '^[0-9a-f]{64}$'))
);
CREATE INDEX circle_review_coverage_actor ON public.circle_review_coverage_sessions(actor_id,circle_id,message_id);
CREATE INDEX circle_review_coverage_active_case ON public.circle_review_coverage_sessions(circle_id,message_id) WHERE NOT invalidated;
CREATE INDEX circle_review_coverage_listing_order ON public.circle_reports(cohort_id,created_at,id) WHERE status='open';
CREATE TABLE public.circle_review_coverage_pages(
 session_id uuid NOT NULL REFERENCES public.circle_review_coverage_sessions(id), page_number integer NOT NULL CHECK(page_number>=1),
 token uuid NOT NULL DEFAULT gen_random_uuid(), after_time timestamptz, after_id uuid, last_time timestamptz, last_id uuid,
 report_count integer NOT NULL CHECK(report_count BETWEEN 0 AND 50), acknowledged boolean NOT NULL DEFAULT false,
 PRIMARY KEY(session_id,page_number), UNIQUE(session_id,token),
 CHECK((after_time IS NULL)=(after_id IS NULL)), CHECK((last_time IS NULL)=(last_id IS NULL)),
 CHECK((report_count=0 AND last_id IS NULL) OR (report_count>0 AND last_id IS NOT NULL))
);
ALTER TABLE public.circle_review_coverage_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_review_coverage_pages ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.circle_review_coverage_sessions IS 'soe-review-coverage:v1; private server-held sequential coverage; no report text; 30-minute inactivity/grant expiry; acknowledgement is not comprehension';
COMMENT ON TABLE public.circle_review_coverage_pages IS 'soe-review-coverage:v1; only issued bounded page cursors and acknowledgement metadata; no reporter identity or report text';
CREATE FUNCTION public._soe_circle_review_coverage_invalidate() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE targets uuid[]; cid uuid; aid uuid;
BEGIN
 IF TG_TABLE_NAME='book_cohorts' THEN
  IF TG_OP='DELETE' THEN targets:=ARRAY[OLD.id]; ELSE targets:=ARRAY[OLD.id,NEW.id]; END IF;
  UPDATE public.circle_review_coverage_sessions SET invalidated=true WHERE circle_id=ANY(targets) AND NOT invalidated;
 ELSIF TG_TABLE_NAME='circle_reviewer_grants' THEN
  cid:=OLD.cohort_id; aid:=OLD.member_id;
  IF TG_OP='DELETE' THEN
   UPDATE public.circle_review_coverage_sessions SET invalidated=true WHERE circle_id=cid AND actor_id=aid AND NOT invalidated;
  ELSE
   UPDATE public.circle_review_coverage_sessions SET invalidated=true WHERE ((circle_id=cid AND actor_id=aid) OR (circle_id=NEW.cohort_id AND actor_id=NEW.member_id)) AND NOT invalidated;
  END IF;
 ELSIF TG_TABLE_NAME='circle_reports' THEN
  IF TG_OP='DELETE' THEN targets:=ARRAY[OLD.cohort_id]; ELSIF TG_OP='INSERT' THEN targets:=ARRAY[NEW.cohort_id]; ELSE targets:=ARRAY[OLD.cohort_id,NEW.cohort_id]; END IF;
  UPDATE public.circle_review_coverage_sessions SET invalidated=true WHERE message_id IS NULL AND circle_id=ANY(targets) AND NOT invalidated;
 ELSE
  IF TG_TABLE_NAME='seminar_messages' THEN
   IF TG_OP='DELETE' THEN targets:=ARRAY[OLD.id]; ELSE targets:=ARRAY[OLD.id,NEW.id]; END IF;
  ELSE
   IF TG_OP='DELETE' THEN targets:=ARRAY[OLD.message_id]; ELSIF TG_OP='INSERT' THEN targets:=ARRAY[NEW.message_id]; ELSE targets:=ARRAY[OLD.message_id,NEW.message_id]; END IF;
  END IF;
  UPDATE public.circle_review_coverage_sessions SET invalidated=true WHERE message_id=ANY(targets) AND NOT invalidated;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER circle_review_coverage_grant_change AFTER UPDATE OR DELETE ON public.circle_reviewer_grants FOR EACH ROW EXECUTE FUNCTION public._soe_circle_review_coverage_invalidate();
CREATE TRIGGER circle_review_coverage_circle_change AFTER UPDATE OR DELETE ON public.book_cohorts FOR EACH ROW EXECUTE FUNCTION public._soe_circle_review_coverage_invalidate();
CREATE TRIGGER circle_review_coverage_report_change AFTER INSERT OR UPDATE OR DELETE ON public.circle_reports FOR EACH ROW EXECUTE FUNCTION public._soe_circle_review_coverage_invalidate();
CREATE TRIGGER circle_review_coverage_message_report_change AFTER INSERT OR UPDATE OR DELETE ON public.circle_message_reports FOR EACH ROW EXECUTE FUNCTION public._soe_circle_review_coverage_invalidate();
CREATE TRIGGER circle_review_coverage_state_change AFTER INSERT OR UPDATE OR DELETE ON public.circle_message_states FOR EACH ROW EXECUTE FUNCTION public._soe_circle_review_coverage_invalidate();
CREATE TRIGGER circle_review_coverage_message_change AFTER UPDATE OR DELETE ON public.seminar_messages FOR EACH ROW EXECUTE FUNCTION public._soe_circle_review_coverage_invalidate();
CREATE FUNCTION public._soe_circle_review_coverage_snapshot(p_actor uuid,p_circle_id uuid,p_message_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE rev bigint; h text; sh text; n bigint; expiry timestamptz;
BEGIN
 IF p_message_id IS NULL THEN
  PERFORM public._soe_circle_review_authorize(p_actor,p_circle_id);
  SELECT circle_review_revision,md5(jsonb_build_array(title,description,circle_hidden)::text) INTO rev,sh FROM public.book_cohorts WHERE id=p_circle_id;
  SELECT count(*) INTO n FROM public.circle_reports WHERE cohort_id=p_circle_id AND status='open';
 ELSE
  PERFORM public._soe_circle_message_review_authorize(p_actor,p_circle_id,p_message_id);
  SELECT coalesce(s.revision,0),public._soe_circle_message_hash(m.content),md5(jsonb_build_array(c.title,m.member_name,m.content,m.created_at,coalesce(s.hidden,false),coalesce(s.withdrawn,false))::text)
   INTO rev,h,sh FROM public.seminar_messages m JOIN public.book_cohorts c ON c.id=m.cohort_id LEFT JOIN public.circle_message_states s ON s.message_id=m.id WHERE m.id=p_message_id;
  SELECT count(*) INTO n FROM public.circle_message_reports WHERE message_id=p_message_id AND status='open';
 END IF;
 IF n>2147483647 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review count requires operational review'; END IF;
 -- Time may advance during counts; reauthorize before returning private progress.
 IF p_message_id IS NULL THEN PERFORM public._soe_circle_review_authorize(p_actor,p_circle_id);
 ELSE PERFORM public._soe_circle_message_review_authorize(p_actor,p_circle_id,p_message_id); END IF;
 SELECT expires_at INTO expiry FROM public.circle_reviewer_grants WHERE cohort_id=p_circle_id AND member_id=p_actor;
 RETURN jsonb_build_object('revision',rev,'contentHash',h,'sourceHash',sh,'totalReports',n,'grantExpiresAt',expiry);
END $$;
CREATE FUNCTION public._soe_circle_review_coverage_check(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_session_id uuid) RETURNS public.circle_review_coverage_sessions LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE snap jsonb; s public.circle_review_coverage_sessions;
BEGIN
 snap:=public._soe_circle_review_coverage_snapshot(p_actor,p_circle_id,p_message_id);
 SELECT * INTO s FROM public.circle_review_coverage_sessions WHERE id=p_session_id AND actor_id=p_actor AND circle_id=p_circle_id AND message_id IS NOT DISTINCT FROM p_message_id FOR UPDATE;
 IF NOT FOUND OR s.invalidated OR s.used_request_id IS NOT NULL OR s.expires_at<=clock_timestamp()
  OR s.revision IS DISTINCT FROM (snap->>'revision')::bigint OR s.content_hash IS DISTINCT FROM snap->>'contentHash'
  OR s.source_hash IS DISTINCT FROM snap->>'sourceHash' OR s.total_reports IS DISTINCT FROM (snap->>'totalReports')::integer THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review coverage changed or expired; start a fresh review';
 END IF;
 RETURN s;
END $$;
CREATE FUNCTION public._soe_circle_review_coverage_issue(p_session_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE s public.circle_review_coverage_sessions; prev public.circle_review_coverage_pages; n integer; lt timestamptz; li uuid;
BEGIN
 SELECT * INTO s FROM public.circle_review_coverage_sessions WHERE id=p_session_id;
 IF s.frontier>1 THEN SELECT * INTO prev FROM public.circle_review_coverage_pages WHERE session_id=s.id AND page_number=s.frontier-1; END IF;
 IF s.message_id IS NULL THEN
  SELECT count(*)::integer INTO n FROM(SELECT 1 FROM public.circle_reports WHERE cohort_id=s.circle_id AND status='open' AND (prev.last_id IS NULL OR (created_at,id)>(prev.last_time,prev.last_id)) ORDER BY created_at,id LIMIT 50) q;
  SELECT created_at,id INTO lt,li FROM(SELECT created_at,id FROM public.circle_reports WHERE cohort_id=s.circle_id AND status='open' AND (prev.last_id IS NULL OR (created_at,id)>(prev.last_time,prev.last_id)) ORDER BY created_at,id LIMIT 50) q ORDER BY created_at DESC,id DESC LIMIT 1;
 ELSE
  SELECT count(*)::integer INTO n FROM(SELECT 1 FROM public.circle_message_reports WHERE message_id=s.message_id AND status='open' AND (prev.last_id IS NULL OR (created_at,id)>(prev.last_time,prev.last_id)) ORDER BY created_at,id LIMIT 50) q;
  SELECT created_at,id INTO lt,li FROM(SELECT created_at,id FROM public.circle_message_reports WHERE message_id=s.message_id AND status='open' AND (prev.last_id IS NULL OR (created_at,id)>(prev.last_time,prev.last_id)) ORDER BY created_at,id LIMIT 50) q ORDER BY created_at DESC,id DESC LIMIT 1;
 END IF;
 IF n=0 AND s.total_reports<>0 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review page changed'; END IF;
 INSERT INTO public.circle_review_coverage_pages(session_id,page_number,after_time,after_id,last_time,last_id,report_count,acknowledged)
 VALUES(s.id,s.frontier,prev.last_time,prev.last_id,lt,li,n,n=0);
END $$;
CREATE FUNCTION public._soe_circle_review_coverage_project(p_session_id uuid,p_page_number integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE s public.circle_review_coverage_sessions; p public.circle_review_coverage_pages; reports jsonb;
BEGIN
 SELECT * INTO s FROM public.circle_review_coverage_sessions WHERE id=p_session_id;
 SELECT * INTO p FROM public.circle_review_coverage_pages WHERE session_id=s.id AND page_number=coalesce(p_page_number,s.frontier);
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Only issued review pages are available'; END IF;
 IF s.message_id IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'reason',reason,'note',note,'created_at',created_at) ORDER BY created_at,id),'[]'::jsonb) INTO reports FROM(SELECT id,reason,note,created_at FROM public.circle_reports WHERE cohort_id=s.circle_id AND status='open' AND (p.after_id IS NULL OR (created_at,id)>(p.after_time,p.after_id)) AND (created_at,id)<=(p.last_time,p.last_id) ORDER BY created_at,id LIMIT 50) q;
 ELSE
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'reason',reason,'note',note,'created_at',created_at) ORDER BY created_at,id),'[]'::jsonb) INTO reports FROM(SELECT id,reason,note,created_at FROM public.circle_message_reports WHERE message_id=s.message_id AND status='open' AND (p.after_id IS NULL OR (created_at,id)>(p.after_time,p.after_id)) AND (created_at,id)<=(p.last_time,p.last_id) ORDER BY created_at,id LIMIT 50) q;
 END IF;
 IF jsonb_array_length(reports)<>p.report_count THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review page changed'; END IF;
 RETURN jsonb_build_object('sessionId',s.id,'circleId',s.circle_id,'messageId',s.message_id,'revision',s.revision,'contentHash',s.content_hash,'totalReports',s.total_reports,'reviewedReports',s.reviewed_reports,'pageToken',p.token,'reports',reports,'complete',s.reviewed_reports=s.total_reports,'expiresAt',s.expires_at,'pageNumber',p.page_number,'acknowledged',p.acknowledged);
END $$;
CREATE FUNCTION public.soe_circle_review_coverage_start(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_expected_revision bigint,p_content_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE snap jsonb; sid uuid;
BEGIN
 snap:=public._soe_circle_review_coverage_snapshot(p_actor,p_circle_id,p_message_id);
 IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 OR (p_message_id IS NULL AND p_content_hash IS NOT NULL) OR (p_message_id IS NOT NULL AND (p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$')) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid review coverage snapshot'; END IF;
 IF (snap->>'revision')::bigint IS DISTINCT FROM p_expected_revision OR snap->>'contentHash' IS DISTINCT FROM p_content_hash THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review snapshot changed'; END IF;
 UPDATE public.circle_review_coverage_sessions SET invalidated=true WHERE actor_id=p_actor AND circle_id=p_circle_id AND message_id IS NOT DISTINCT FROM p_message_id AND NOT invalidated AND used_request_id IS NULL;
 INSERT INTO public.circle_review_coverage_sessions(actor_id,circle_id,message_id,revision,content_hash,source_hash,total_reports,expires_at)
 VALUES(p_actor,p_circle_id,p_message_id,p_expected_revision,p_content_hash,snap->>'sourceHash',(snap->>'totalReports')::integer,least(clock_timestamp()+interval '30 minutes',(snap->>'grantExpiresAt')::timestamptz)) RETURNING id INTO sid;
 PERFORM public._soe_circle_review_coverage_issue(sid);
 RETURN public._soe_circle_review_coverage_project(sid,NULL);
END $$;
CREATE FUNCTION public.soe_circle_review_coverage_page(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_session_id uuid,p_page_number integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public._soe_circle_review_coverage_check(p_actor,p_circle_id,p_message_id,p_session_id);
 IF p_page_number IS NOT NULL AND p_page_number<1 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid review page'; END IF;
 RETURN public._soe_circle_review_coverage_project(p_session_id,p_page_number);
END $$;
CREATE FUNCTION public.soe_circle_review_coverage_ack(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_session_id uuid,p_page_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE s public.circle_review_coverage_sessions; p public.circle_review_coverage_pages; expiry timestamptz;
BEGIN
 s:=public._soe_circle_review_coverage_check(p_actor,p_circle_id,p_message_id,p_session_id);
 SELECT * INTO p FROM public.circle_review_coverage_pages WHERE session_id=s.id AND token=p_page_token;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review page token does not match'; END IF;
 IF p.acknowledged THEN RETURN public._soe_circle_review_coverage_project(s.id,NULL); END IF;
 IF p.page_number<>s.frontier OR s.reviewed_reports>=s.total_reports THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Acknowledge review pages in order'; END IF;
 SELECT expires_at INTO expiry FROM public.circle_reviewer_grants WHERE cohort_id=p_circle_id AND member_id=p_actor;
 UPDATE public.circle_review_coverage_pages SET acknowledged=true WHERE session_id=s.id AND page_number=p.page_number;
 UPDATE public.circle_review_coverage_sessions SET reviewed_reports=reviewed_reports+p.report_count,
  frontier=frontier+CASE WHEN reviewed_reports+p.report_count<total_reports THEN 1 ELSE 0 END,
  expires_at=least(clock_timestamp()+interval '30 minutes',expiry) WHERE id=s.id RETURNING * INTO s;
 IF s.reviewed_reports<s.total_reports THEN PERFORM public._soe_circle_review_coverage_issue(s.id); END IF;
 RETURN public._soe_circle_review_coverage_project(s.id,NULL);
END $$;
CREATE FUNCTION public.soe_circle_review_coverage_decide(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_session_id uuid,
 p_expected_revision bigint,p_content_hash text,p_request_id uuid,p_action text,p_reason text,p_summary text,p_evidence_report_id uuid,p_evidence_excerpt text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE s public.circle_review_coverage_sessions; payload jsonb; result jsonb; source_text text; current_revision bigint;
 listing_prior public.circle_review_decisions; listing_decision public.circle_review_decisions;
 message_prior public.circle_message_receipts; message_decision public.circle_message_decisions;
 state public.circle_message_states; m public.seminar_messages;
BEGIN
 -- Authorization precedes exact replay. Expired/consumed coverage is irrelevant
 -- to a committed receipt, but revoked/conflicted reviewers never get it back.
 IF p_message_id IS NULL THEN PERFORM public._soe_circle_review_authorize(p_actor,p_circle_id);
 ELSE PERFORM public._soe_circle_message_review_authorize(p_actor,p_circle_id,p_message_id); END IF;
 IF p_session_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991
 OR (p_message_id IS NULL AND p_content_hash IS NOT NULL) OR (p_message_id IS NOT NULL AND (p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$'))
 OR p_action IS NULL OR p_action NOT IN('hide','restore') OR p_reason IS NULL OR p_summary IS NULL
 OR length(btrim(p_summary)) NOT BETWEEN 20 AND 1000 OR length(p_summary)>1000
 OR (p_action='hide' AND (p_reason NOT IN('safety','harassment','spam','misleading','inappropriate') OR (p_message_id IS NULL AND p_reason='inappropriate')
  OR p_evidence_excerpt IS NULL OR length(btrim(p_evidence_excerpt)) NOT BETWEEN 5 AND 500 OR length(p_evidence_excerpt)>500))
 OR (p_action='restore' AND (p_reason NOT IN('no_violation','insufficient_evidence','resolved') OR p_evidence_report_id IS NOT NULL OR p_evidence_excerpt IS NOT NULL)) THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid review decision';
 END IF;
 payload:=jsonb_build_object('coverageSessionId',p_session_id,'circleId',p_circle_id,'messageId',p_message_id,'expectedRevision',p_expected_revision,'contentHash',p_content_hash,
  'action',p_action,'reason',p_reason,'summary',p_summary,'evidenceReportId',p_evidence_report_id,'evidenceExcerpt',p_evidence_excerpt);
 IF p_message_id IS NULL THEN
  SELECT * INTO listing_prior FROM public.circle_review_decisions WHERE actor_member_id=p_actor AND request_id=p_request_id;
  IF FOUND THEN
   IF listing_prior.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review request conflicts'; END IF;
   SELECT circle_review_revision INTO current_revision FROM public.book_cohorts WHERE id=p_circle_id;
   RETURN jsonb_build_object('sessionId',p_session_id,'decision',jsonb_build_object('id',listing_prior.id,'action',listing_prior.action,'reason',listing_prior.reason,'summary',listing_prior.summary,'created_at',listing_prior.created_at,'report_count',listing_prior.report_count),
    'revision',current_revision,'hidden',(SELECT circle_hidden FROM public.book_cohorts WHERE id=p_circle_id),'replayed',true);
  END IF;
 ELSE
  SELECT * INTO message_prior FROM public.circle_message_receipts WHERE actor_member_id=p_actor AND request_id=p_request_id;
  IF FOUND THEN
   IF message_prior.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review request conflicts'; END IF;
   SELECT * INTO state FROM public.circle_message_states WHERE message_id=p_message_id;
   RETURN message_prior.result||jsonb_build_object('sessionId',p_session_id,'safety',jsonb_build_object('revision',coalesce(state.revision,0),'visibility',public._soe_circle_message_visibility(coalesce(state.hidden,false),coalesce(state.withdrawn,false))),'replayed',true);
  END IF;
 END IF;
 s:=public._soe_circle_review_coverage_check(p_actor,p_circle_id,p_message_id,p_session_id);
 IF s.reviewed_reports<>s.total_reports OR s.revision<>p_expected_revision OR s.content_hash IS DISTINCT FROM p_content_hash OR s.revision>=9007199254740991
 OR EXISTS(SELECT 1 FROM public.circle_review_coverage_pages WHERE session_id=s.id AND NOT acknowledged)
 OR (SELECT coalesce(sum(report_count),0) FROM public.circle_review_coverage_pages WHERE session_id=s.id AND acknowledged)<>s.total_reports THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Complete the current report review before deciding';
 END IF;
 IF p_action='hide' THEN
  IF p_evidence_report_id IS NOT NULL THEN
   IF p_message_id IS NULL THEN SELECT note INTO source_text FROM public.circle_reports WHERE id=p_evidence_report_id AND cohort_id=p_circle_id AND status='open';
   ELSE SELECT note INTO source_text FROM public.circle_message_reports WHERE id=p_evidence_report_id AND message_id=p_message_id AND status='open'; END IF;
  ELSIF p_message_id IS NULL THEN
   SELECT CASE WHEN strpos(title,p_evidence_excerpt)>0 THEN title ELSE description END INTO source_text FROM public.book_cohorts WHERE id=p_circle_id;
  ELSE SELECT content INTO source_text FROM public.seminar_messages WHERE id=p_message_id; END IF;
  IF source_text IS NULL OR strpos(source_text,p_evidence_excerpt)=0 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Evidence must match the reviewed source'; END IF;
 END IF;
 -- Explicit existing decision semantics; no dynamic rewrite of prior function bodies.
 IF p_message_id IS NULL THEN
  UPDATE public.book_cohorts SET circle_hidden=(p_action='hide'),circle_review_revision=circle_review_revision+1 WHERE id=p_circle_id RETURNING circle_review_revision INTO current_revision;
  UPDATE public.circle_reports SET status=CASE WHEN p_action='hide' THEN 'reviewed' ELSE 'dismissed' END WHERE cohort_id=p_circle_id AND status='open';
  BEGIN
   INSERT INTO public.circle_review_decisions(cohort_id,actor_member_id,request_id,payload,action,reason,summary,evidence_report_id,evidence_excerpt,report_count,revision,hidden)
   VALUES(p_circle_id,p_actor,p_request_id,payload,p_action,p_reason,btrim(p_summary),p_evidence_report_id,p_evidence_excerpt,s.total_reports,current_revision,p_action='hide') RETURNING * INTO listing_decision;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review request conflicts'; END;
  result:=jsonb_build_object('sessionId',p_session_id,'decision',jsonb_build_object('id',listing_decision.id,'action',listing_decision.action,'reason',listing_decision.reason,'summary',listing_decision.summary,'created_at',listing_decision.created_at,'report_count',listing_decision.report_count),
   'revision',current_revision,'hidden',listing_decision.hidden,'replayed',false);
 ELSE
  INSERT INTO public.circle_message_states(message_id,cohort_id) VALUES(p_message_id,p_circle_id) ON CONFLICT(message_id) DO NOTHING;
  UPDATE public.circle_message_states SET hidden=(p_action='hide'),revision=revision+1 WHERE message_id=p_message_id RETURNING * INTO state;
  UPDATE public.circle_message_reports SET status=CASE WHEN p_action='hide' THEN 'reviewed' ELSE 'dismissed' END WHERE message_id=p_message_id AND status='open';
  BEGIN
   INSERT INTO public.circle_message_decisions(cohort_id,message_id,actor_member_id,request_id,action,reason,summary,evidence_report_id,evidence_excerpt,content_hash,report_count,revision)
   VALUES(p_circle_id,p_message_id,p_actor,p_request_id,p_action,p_reason,btrim(p_summary),p_evidence_report_id,p_evidence_excerpt,p_content_hash,s.total_reports,state.revision) RETURNING * INTO message_decision;
   result:=jsonb_build_object('sessionId',p_session_id,'requestId',p_request_id,'circleId',p_circle_id,'messageId',p_message_id,'decision',jsonb_build_object('id',message_decision.id,'action',message_decision.action,'reason',message_decision.reason,'summary',message_decision.summary,'created_at',message_decision.created_at,'report_count',message_decision.report_count));
   INSERT INTO public.circle_message_receipts(actor_member_id,request_id,payload,result) VALUES(p_actor,p_request_id,payload,result);
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review request conflicts'; END;
  result:=result||jsonb_build_object('safety',jsonb_build_object('revision',state.revision,'visibility',public._soe_circle_message_visibility(state.hidden,state.withdrawn)),'replayed',false);
 END IF;
 UPDATE public.circle_review_coverage_sessions SET used_request_id=p_request_id WHERE id=s.id;
 RETURN result;
END $$;
DO $privileges$
DECLARE r record; recipient text;
BEGIN
 FOR r IN SELECT c.oid,a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
 WHERE c.oid IN('public.circle_review_coverage_sessions'::regclass,'public.circle_review_coverage_pages'::regclass) AND a.grantee<>c.relowner LOOP
  recipient:=CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
  EXECUTE format('REVOKE ALL ON TABLE %s FROM %s RESTRICT',r.oid::regclass,recipient);
 END LOOP;
 FOR r IN SELECT p.oid,a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'soe_circle_review_coverage_%' OR p.proname LIKE '_soe_circle_review_coverage_%') AND a.grantee<>p.proowner LOOP
  recipient:=CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s RESTRICT',r.oid::regprocedure,recipient);
 END LOOP;
 GRANT SELECT,INSERT,UPDATE ON public.circle_review_coverage_sessions,public.circle_review_coverage_pages TO service_role;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'soe_circle_review_coverage_%' OR proname LIKE '_soe_circle_review_coverage_%') LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.oid::regprocedure);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles b CROSS JOIN pg_class c WHERE b.rolname IN('anon','authenticated') AND c.oid IN('public.circle_review_coverage_sessions'::regclass,'public.circle_review_coverage_pages'::regclass)
 AND (has_table_privilege(b.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(b.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 OR EXISTS(SELECT 1 FROM pg_roles b CROSS JOIN pg_proc p WHERE b.rolname IN('anon','authenticated') AND p.pronamespace='public'::regnamespace AND (p.proname LIKE 'soe_circle_review_coverage_%' OR p.proname LIKE '_soe_circle_review_coverage_%') AND has_function_privilege(b.oid,p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Review coverage browser authority remains open';
 END IF;
END $privileges$;
COMMIT;
