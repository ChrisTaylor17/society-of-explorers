-- UNAPPLIED LOCAL CANDIDATE. No production SQL, deployment or provider activation.
-- Apply after circle-moderation.sql and circle-review-coverage.sql.
-- Only listing receipts change: exact server Circle/request IDs accompany original
-- decisions and current revision/visibility. Authorization and replay stay intact.
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,public;
DO $guard$
DECLARE r record; p pg_proc; owner_id oid; service_id oid; expected_marker text;
BEGIN
 SELECT oid INTO owner_id FROM pg_roles WHERE rolname=current_user;
 SELECT oid INTO service_id FROM pg_roles WHERE rolname='service_role' AND rolbypassrls
  AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication;
 IF current_user IN('anon','authenticated','service_role') OR service_id IS NULL
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2 THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Listing receipt migration authority requires review';
 END IF;
 FOR r IN SELECT * FROM (VALUES
  ('soe_circle_review_decide(uuid,uuid,bigint,uuid,text,text,text,uuid,text)','3fe60c918af25f8ea3d48924ca02137c','995d6c587bc0ccafdd12bce1b3f2a0f8','b309be8c2a075ec71d54c58ea9a185ef','p_actor,p_circle_id,p_expected_revision,p_request_id,p_action,p_reason,p_summary,p_evidence_report_id,p_evidence_excerpt',2),
  ('soe_circle_review_coverage_decide(uuid,uuid,uuid,uuid,bigint,text,uuid,text,text,text,uuid,text)','37cf8dbfe3eaab7c868a8f294fd570ea','b33d72e2eb8a1eab22aaf4c0afc71faf','bb77547b3d3a7606603b0bcbeefcf0ef','p_actor,p_circle_id,p_message_id,p_session_id,p_expected_revision,p_content_hash,p_request_id,p_action,p_reason,p_summary,p_evidence_report_id,p_evidence_excerpt',0)
 ) expected(signature,original_hash,enabled_hash,disabled_hash,arg_names,defaults) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.'||r.signature);
  expected_marker:=CASE md5(p.prosrc) WHEN r.original_hash THEN NULL
   WHEN r.enabled_hash THEN 'soe-circle-listing-receipt:v1' WHEN r.disabled_hash THEN 'soe-circle-listing-receipt:v1:disabled'
   ELSE 'UNRECOGNIZED' END;
  IF p.oid IS NULL OR p.proowner<>owner_id OR expected_marker='UNRECOGNIZED'
   OR p.prosecdef OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
   OR p.provolatile<>'v' OR p.prorettype<>'jsonb'::regtype
   OR p.proargnames IS DISTINCT FROM string_to_array(r.arg_names,',') OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
   OR p.prokind<>'f' OR p.proisstrict OR p.proleakproof OR p.proretset OR p.proparallel<>'u'
   OR p.pronargdefaults<>r.defaults OR pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM (CASE WHEN r.defaults=2 THEN 'NULL::uuid, NULL::text' ELSE NULL END)
   OR p.provariadic<>0 OR p.procost<>100 OR p.prorows<>0 OR p.probin IS NOT NULL
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM expected_marker
   OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=p.proname)<>1 THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Listing receipt function definition requires review';
  END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>owner_id
    AND (a.grantee<>service_id OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
   OR NOT has_function_privilege(service_id,p.oid,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND has_function_privilege(oid,p.oid,'EXECUTE')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Listing receipt function grants require review';
  END IF;
 END LOOP;
END $guard$;
-- Drain decision writers before replacement. These locks do not change rows.
LOCK TABLE public.book_cohorts,public.circle_review_decisions,
 public.circle_review_coverage_sessions,public.circle_review_coverage_pages IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE r record; p pg_proc; owner_id oid; service_id oid; expected_marker text;
BEGIN
 SELECT oid INTO owner_id FROM pg_roles WHERE rolname=current_user;
 SELECT oid INTO service_id FROM pg_roles WHERE rolname='service_role' AND rolbypassrls
  AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication;
 IF current_user IN('anon','authenticated','service_role') OR service_id IS NULL
  OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2 THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Listing receipt migration authority requires review';
 END IF;
 FOR r IN SELECT * FROM (VALUES
  ('soe_circle_review_decide(uuid,uuid,bigint,uuid,text,text,text,uuid,text)','3fe60c918af25f8ea3d48924ca02137c','995d6c587bc0ccafdd12bce1b3f2a0f8','b309be8c2a075ec71d54c58ea9a185ef','p_actor,p_circle_id,p_expected_revision,p_request_id,p_action,p_reason,p_summary,p_evidence_report_id,p_evidence_excerpt',2),
  ('soe_circle_review_coverage_decide(uuid,uuid,uuid,uuid,bigint,text,uuid,text,text,text,uuid,text)','37cf8dbfe3eaab7c868a8f294fd570ea','b33d72e2eb8a1eab22aaf4c0afc71faf','bb77547b3d3a7606603b0bcbeefcf0ef','p_actor,p_circle_id,p_message_id,p_session_id,p_expected_revision,p_content_hash,p_request_id,p_action,p_reason,p_summary,p_evidence_report_id,p_evidence_excerpt',0)
 ) expected(signature,original_hash,enabled_hash,disabled_hash,arg_names,defaults) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.'||r.signature);
  expected_marker:=CASE md5(p.prosrc) WHEN r.original_hash THEN NULL
   WHEN r.enabled_hash THEN 'soe-circle-listing-receipt:v1' WHEN r.disabled_hash THEN 'soe-circle-listing-receipt:v1:disabled'
   ELSE 'UNRECOGNIZED' END;
  IF p.oid IS NULL OR p.proowner<>owner_id OR expected_marker='UNRECOGNIZED'
   OR p.prosecdef OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
   OR p.provolatile<>'v' OR p.prorettype<>'jsonb'::regtype
   OR p.proargnames IS DISTINCT FROM string_to_array(r.arg_names,',') OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
   OR p.prokind<>'f' OR p.proisstrict OR p.proleakproof OR p.proretset OR p.proparallel<>'u'
   OR p.pronargdefaults<>r.defaults OR pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM (CASE WHEN r.defaults=2 THEN 'NULL::uuid, NULL::text' ELSE NULL END)
   OR p.provariadic<>0 OR p.procost<>100 OR p.prorows<>0 OR p.probin IS NOT NULL
   OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM expected_marker
   OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=p.proname)<>1 THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Listing receipt function definition requires review';
  END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>owner_id
    AND (a.grantee<>service_id OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
   OR NOT has_function_privilege(service_id,p.oid,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND has_function_privilege(oid,p.oid,'EXECUTE')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Listing receipt function grants require review';
  END IF;
 END LOOP;
END $guard$;
CREATE OR REPLACE FUNCTION public.soe_circle_review_decide(p_actor uuid, p_circle_id uuid, p_expected_revision bigint,
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
    RETURN jsonb_build_object('circleId', p_circle_id, 'requestId', p_request_id, 'decision', v_public, 'revision', v_current,
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
  RETURN jsonb_build_object('circleId', p_circle_id, 'requestId', p_request_id, 'decision', v_public, 'revision', v_next, 'hidden', v_decision.hidden, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.soe_circle_review_coverage_decide(p_actor uuid,p_circle_id uuid,p_message_id uuid,p_session_id uuid,
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
   RETURN jsonb_build_object('circleId',p_circle_id,'requestId',p_request_id,'sessionId',p_session_id,'decision',jsonb_build_object('id',listing_prior.id,'action',listing_prior.action,'reason',listing_prior.reason,'summary',listing_prior.summary,'created_at',listing_prior.created_at,'report_count',listing_prior.report_count),
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
  result:=jsonb_build_object('circleId',p_circle_id,'requestId',p_request_id,'sessionId',p_session_id,'decision',jsonb_build_object('id',listing_decision.id,'action',listing_decision.action,'reason',listing_decision.reason,'summary',listing_decision.summary,'created_at',listing_decision.created_at,'report_count',listing_decision.report_count),
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
COMMENT ON FUNCTION public.soe_circle_review_decide(uuid,uuid,bigint,uuid,text,text,text,uuid,text) IS 'soe-circle-listing-receipt:v1';
COMMENT ON FUNCTION public.soe_circle_review_coverage_decide(uuid,uuid,uuid,uuid,bigint,text,uuid,text,text,text,uuid,text) IS 'soe-circle-listing-receipt:v1';
COMMIT;
