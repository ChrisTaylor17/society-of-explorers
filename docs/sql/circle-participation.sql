-- UNAPPLIED CANDIDATE. No live schema, data, grants or settings were changed.
-- Requires the strict legacy baseline or historical cohort fixture, Circle
-- schema, and both prior moderation candidates.
-- Canonical server member identity only; no roles/reviewers/accounts provisioned.
-- Review current grants, policies, PG/tzdata version and existing Circle data in
-- an authorized isolated restore before considering deployment.
BEGIN;
SET LOCAL search_path=pg_catalog,public;

DO $$
DECLARE p record; expected_using text; expected_check text; strict_baseline boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND (rolbypassrls OR rolsuper))
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls))
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated'))<>2
    OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles browser ON browser.oid=m.member WHERE browser.rolname IN('anon','authenticated')) THEN
    RAISE EXCEPTION 'Unexpected service/browser role configuration';
  END IF;
  strict_baseline:=(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN('book_cohorts','book_cohort_members','seminar_messages'))=5;
  -- Explicit strict branch: installed owner-only receipt plus no raw browser
  -- authority. It never manufactures permissive policies to satisfy old fixtures.
  IF NOT strict_baseline AND to_regclass('public.soe_circle_legacy_baseline_v1_state') IS NOT NULL THEN
    RAISE EXCEPTION 'Strict legacy Circle baseline cannot fall back to historical policies';
  END IF;
  IF strict_baseline THEN
    IF to_regclass('public.soe_circle_legacy_baseline_v1_state') IS NULL
      OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.soe_circle_legacy_baseline_v1_state')
        AND c.relkind='r' AND NOT c.relispartition AND NOT c.relhassubclass AND c.relrowsecurity AND NOT c.relforcerowsecurity
        AND pg_get_userbyid(c.relowner)=current_user AND obj_description(c.oid,'pg_class')='soe-circle-legacy-baseline:v1:owned')
      OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('public.soe_circle_legacy_baseline_v1_state'))
      OR (SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public.soe_circle_legacy_baseline_v1_state') AND attnum>0 AND NOT attisdropped)<>4
      OR (SELECT count(*) FROM pg_attribute WHERE attrelid=to_regclass('public.soe_circle_legacy_baseline_v1_state') AND attnum>0 AND NOT attisdropped
        AND attnotnull AND NOT atthasdef AND attidentity='' AND attgenerated='' AND ((attname IN('target_table','integrity_digest') AND atttypid='text'::regtype)
          OR (attname IN('prior_state','post_state') AND atttypid='jsonb'::regtype)))<>4
      OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.soe_circle_legacy_baseline_v1_state') AND NOT tgisinternal)
      OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=to_regclass('public.soe_circle_legacy_baseline_v1_state') OR inhparent=to_regclass('public.soe_circle_legacy_baseline_v1_state'))
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=to_regclass('public.soe_circle_legacy_baseline_v1_state'))<>1
      OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.soe_circle_legacy_baseline_v1_state') AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (target_table)')
      OR (SELECT count(*) FROM pg_index WHERE indrelid=to_regclass('public.soe_circle_legacy_baseline_v1_state'))<>1
      OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
        WHERE c.oid=to_regclass('public.soe_circle_legacy_baseline_v1_state') AND a.grantee<>c.relowner)
      OR EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x JOIN pg_class c ON c.oid=a.attrelid
        WHERE c.oid=to_regclass('public.soe_circle_legacy_baseline_v1_state') AND x.grantee<>c.relowner)
      OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.seminar_messages'::regclass AND attname='member_name'
        AND atttypid='text'::regtype AND NOT attnotnull AND NOT atthasdef AND attidentity='' AND attgenerated='' AND NOT attisdropped)
      OR has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE')
      OR EXISTS(SELECT 1 FROM pg_roles browser CROSS JOIN pg_class c WHERE browser.rolname IN('anon','authenticated')
        AND c.relnamespace='public'::regnamespace AND c.relname IN('book_cohorts','book_cohort_members','seminar_messages')
        AND (has_table_privilege(browser.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(browser.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) THEN
      RAISE EXCEPTION 'Strict legacy Circle baseline protection requires review';
    END IF;
    IF (SELECT count(*) FROM public.soe_circle_legacy_baseline_v1_state)<>3
      OR EXISTS(SELECT 1 FROM public.soe_circle_legacy_baseline_v1_state s
        WHERE s.target_table NOT IN('book_cohorts','book_cohort_members','seminar_messages')
          OR jsonb_typeof(s.prior_state)<>'object' OR jsonb_typeof(s.post_state)<>'object'
          OR s.integrity_digest IS DISTINCT FROM md5(s.target_table||E'\n'||s.prior_state::text||E'\n'||s.post_state::text||E'\nsoe-circle-legacy-baseline:v1')) THEN
      RAISE EXCEPTION 'Strict legacy Circle baseline receipt requires review';
    END IF;
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN('book_cohorts','book_cohort_members','seminar_messages'))<>(CASE WHEN strict_baseline THEN 5 ELSE 9 END) THEN
    RAISE EXCEPTION 'Unknown Circle policy configuration';
  END IF;
  FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN('book_cohorts','book_cohort_members','seminar_messages') LOOP
    expected_using:=NULL; expected_check:=NULL;
    IF p.policyname IN('Cohort members open','Seminar messages open','Cohorts public read','Cohorts insert') THEN
      IF strict_baseline OR p.permissive<>'PERMISSIVE' OR p.roles<>ARRAY['public']::name[] THEN RAISE EXCEPTION 'Unknown legacy policy authority'; END IF;
      IF (p.tablename='book_cohort_members' AND p.policyname='Cohort members open' AND p.cmd='ALL')
        OR (p.tablename='seminar_messages' AND p.policyname='Seminar messages open' AND p.cmd='ALL') THEN expected_using:='true'; expected_check:='true';
      ELSIF p.tablename='book_cohorts' AND p.policyname='Cohorts public read' AND p.cmd='SELECT' THEN expected_using:='true';
      ELSIF p.tablename='book_cohorts' AND p.policyname='Cohorts insert' AND p.cmd='INSERT' THEN expected_check:='true';
      ELSE RAISE EXCEPTION 'Unknown legacy policy'; END IF;
    ELSE
      IF p.permissive<>'RESTRICTIVE' OR p.roles<>ARRAY['anon','authenticated']::name[] THEN RAISE EXCEPTION 'Missing restrictive Circle authority'; END IF;
      IF (p.tablename='book_cohort_members' AND p.policyname='circle_members_browser_restrict' AND p.cmd='ALL')
        OR (p.tablename='seminar_messages' AND p.policyname='circle_messages_browser_restrict' AND p.cmd='ALL') THEN
        expected_using:=format('(NOT (EXISTS ( SELECT 1 FROM book_cohorts c WHERE ((c.id = %s.cohort_id) AND (c.book_id = ''soe-circles-path''::text)))))',p.tablename);
        expected_check:=expected_using;
      ELSIF p.tablename='book_cohorts' AND p.policyname='circle_cohorts_browser_insert_restrict' AND p.cmd='INSERT' THEN expected_check:='(book_id <> ''soe-circles-path''::text)';
      ELSIF p.tablename='book_cohorts' AND p.policyname='circle_cohorts_browser_update_restrict' AND p.cmd='UPDATE' THEN expected_using:='(book_id <> ''soe-circles-path''::text)'; expected_check:=expected_using;
      ELSIF p.tablename='book_cohorts' AND p.policyname='circle_cohorts_browser_delete_restrict' AND p.cmd='DELETE' THEN expected_using:='(book_id <> ''soe-circles-path''::text)';
      ELSE RAISE EXCEPTION 'Unknown restrictive Circle policy'; END IF;
    END IF;
    IF regexp_replace(p.qual,'\s','','g') IS DISTINCT FROM regexp_replace(expected_using,'\s','','g')
      OR regexp_replace(p.with_check,'\s','','g') IS DISTINCT FROM regexp_replace(expected_check,'\s','','g') THEN RAISE EXCEPTION 'Changed Circle policy expression requires review'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles owner_role ON owner_role.oid=c.relowner
      WHERE n.nspname='public' AND c.relname IN('book_cohorts','book_cohort_members','seminar_messages','circle_private','circle_rsvps','circle_reviewer_grants','circle_message_states','circle_message_reports','circle_message_decisions','circle_message_receipts')
      AND (NOT c.relrowsecurity OR owner_role.rolname IN('anon','authenticated')))
    OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN('circle_private','circle_rsvps','circle_reviewer_grants','circle_message_states','circle_message_reports','circle_message_decisions','circle_message_receipts'))
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.book_cohorts'::regclass AND tgname='circle_message_parent_retention' AND tgenabled='O') THEN
    RAISE EXCEPTION 'Prior moderation protection requires review';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles browser WHERE browser.rolname IN('anon','authenticated') AND
    (has_table_privilege(browser.oid,'public.book_cohorts','TRUNCATE') OR has_table_privilege(browser.oid,'public.book_cohort_members','TRUNCATE') OR has_table_privilege(browser.oid,'public.seminar_messages','TRUNCATE')
      OR (NOT has_table_privilege(browser.oid,'public.book_cohorts','SELECT') AND (has_table_privilege(browser.oid,'public.book_cohort_members','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege(browser.oid,'public.seminar_messages','SELECT,INSERT,UPDATE,DELETE'))))) THEN
    RAISE EXCEPTION 'Unknown browser grants require review';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles browser CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE browser.rolname IN('anon','authenticated') AND n.nspname='public'
    AND c.relname IN('circle_private','circle_rsvps','circle_reviewer_grants','circle_message_states','circle_message_reports','circle_message_decisions','circle_message_receipts')
    AND has_table_privilege(browser.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN
    RAISE EXCEPTION 'Unknown private Circle grants require review';
  END IF;
END $$;

ALTER TABLE public.book_cohorts ADD COLUMN circle_participation_revision bigint NOT NULL DEFAULT 0 CHECK(circle_participation_revision BETWEEN 0 AND 9007199254740991);
CREATE INDEX circle_participation_host ON public.book_cohorts(created_by,id) WHERE book_id='soe-circles-path';
CREATE INDEX circle_participation_member ON public.book_cohort_members(member_id,cohort_id);
CREATE TABLE public.circle_participation_receipts (
  actor_member_id uuid NOT NULL, request_id uuid NOT NULL, cohort_id uuid NOT NULL,
  payload jsonb NOT NULL, receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_member_id,request_id)
);
CREATE INDEX circle_participation_create_budget ON public.circle_participation_receipts(actor_member_id,created_at) WHERE receipt->>'action'='create';
ALTER TABLE public.circle_participation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.circle_participation_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.circle_participation_receipts TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.book_cohorts TO service_role;
GRANT SELECT,INSERT,DELETE ON public.book_cohort_members TO service_role;
GRANT UPDATE(id) ON public.book_cohort_members TO service_role;
GRANT SELECT,INSERT ON public.circle_private TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.circle_rsvps TO service_role;
GRANT SELECT ON public.members TO service_role;

CREATE FUNCTION public._soe_circle_participation_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='circle_participation_receipts' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Participation receipts are immutable'; END IF;
 IF OLD.book_id='soe-circles-path' AND OLD.status='completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='A completed Circle cannot be reopened'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER circle_participation_receipts_immutable BEFORE UPDATE OR DELETE ON public.circle_participation_receipts FOR EACH ROW EXECUTE FUNCTION public._soe_circle_participation_immutable();
CREATE TRIGGER circle_participation_completion_terminal BEFORE UPDATE OF status ON public.book_cohorts FOR EACH ROW EXECUTE FUNCTION public._soe_circle_participation_immutable();

-- Exactly twelve local calendar dates; never an unbounded future weekly series.
-- Legacy malformed configuration is unavailable for joining/RSVP, not guessed.
CREATE FUNCTION public._soe_circle_participation_dates(c public.book_cohorts) RETURNS date[] LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE first_day date;
BEGIN
 IF c.start_date IS NULL OR c.circle_weekday IS NULL OR c.circle_weekday NOT BETWEEN 0 AND 6
   OR c.circle_timezone IS NULL OR c.circle_timezone NOT IN('America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','UTC')
   OR c.circle_time IS NULL OR c.circle_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR c.status IS NULL OR c.status NOT IN('forming','active','completed') THEN RETURN NULL; END IF;
 first_day:=(c.start_date AT TIME ZONE 'UTC')::date;
 first_day:=first_day+((c.circle_weekday-extract(dow FROM first_day)::integer+7)%7);
 RETURN ARRAY(SELECT first_day+i*7 FROM generate_series(0,11) i ORDER BY i);
END $$;
CREATE FUNCTION public._soe_circle_participation_today(c public.book_cohorts) RETURNS date LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN c.circle_timezone IN('America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','UTC') THEN (statement_timestamp() AT TIME ZONE c.circle_timezone)::date ELSE NULL END;
$$;
-- A broken legacy listing becomes an explicit management-only card, never
-- guessed dates/defaulted private configuration. This predicate reads private
-- configuration solely to classify completeness, and never projects its value.
CREATE FUNCTION public._soe_circle_participation_header_usable(c public.book_cohorts) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE url text;
BEGIN
 IF public._soe_circle_participation_dates(c) IS NULL OR c.title IS NULL OR length(btrim(c.title)) NOT BETWEEN 1 AND 200 OR length(c.title)>200 OR c.title ~ '[[:cntrl:]]'
   OR length(c.description)>2000 OR c.description ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
   OR c.max_members IS NULL OR c.max_members NOT BETWEEN 3 AND 12
   OR to_char(c.start_date AT TIME ZONE 'UTC','YYYY-MM-DD') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR c.circle_format IS NULL OR c.circle_format NOT IN('in_person','online','hybrid')
   OR c.circle_venue_type IS NULL OR c.circle_venue_type NOT IN('library','cafe','community_center','campus','place_of_worship','other_public','online')
   OR length(c.circle_city)>200 OR c.circle_city ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
   OR length(c.circle_region)>200 OR c.circle_region ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
   OR length(c.circle_venue_name)>200 OR c.circle_venue_name ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RETURN false; END IF;
 IF (SELECT count(*) FROM public.book_cohort_members WHERE cohort_id=c.id)>100000 THEN RETURN false; END IF;
 IF c.circle_format IN('online','hybrid') THEN
  BEGIN
   SELECT p.online_url INTO url FROM public.circle_private p WHERE p.cohort_id=c.id;
  EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_column THEN
   -- This only disables joining/RSVP and normal display. It never supplies an
   -- authorization fallback; self management separately verifies actual scope.
   RETURN false;
  END;
  IF NOT FOUND OR url IS NULL OR length(url)>2048 OR url !~ '^https://[^/@[:space:]:]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' THEN RETURN false; END IF;
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION public._soe_circle_participation_state(p_actor uuid,p_circle_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; dates date[]; today date; member boolean; host boolean; ended boolean; completed boolean; configured boolean; n bigint;
BEGIN
 SELECT * INTO c FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path';
 IF NOT FOUND THEN RETURN NULL; END IF;
 dates:=public._soe_circle_participation_dates(c); today:=public._soe_circle_participation_today(c);
 configured:=public._soe_circle_participation_header_usable(c);
 member:=p_actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor);
 host:=coalesce(c.created_by=p_actor,false); completed:=coalesce(c.status='completed',false);
 ended:=completed OR dates IS NULL OR today IS NULL OR today>dates[12];
 SELECT count(*) INTO n FROM public.book_cohort_members WHERE cohort_id=c.id;
 RETURN jsonb_build_object('revision',c.circle_participation_revision,'isMember',member,'isHost',host,'hidden',c.circle_hidden,'completed',completed,'ended',ended,
  'canJoin',p_actor IS NOT NULL AND NOT member AND NOT c.circle_hidden AND NOT ended AND configured AND coalesce(c.max_members BETWEEN 3 AND 12 AND n<c.max_members,false),
  'canLeave',member,'canRsvp',member AND NOT c.circle_hidden AND NOT ended AND configured,'canComplete',host AND NOT completed,'canReadConversation',member AND NOT c.circle_hidden);
END $$;

CREATE FUNCTION public._soe_circle_participation_actor(p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member unavailable'; END IF;
 -- One transaction-scoped actor lane serializes creation limits and receipt keys.
 -- Hash collisions only cause conservative serialization, never authorization.
 PERFORM pg_advisory_xact_lock(hashtextextended('soe-circle-participation:'||p_actor::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member unavailable'; END IF;
END $$;
CREATE FUNCTION public._soe_circle_participation_lock(p_actor uuid,p_circle_id uuid,p_expected_revision bigint) RETURNS public.book_cohorts LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts;
BEGIN
 IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid Circle snapshot'; END IF;
 SELECT * INTO c FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 IF c.circle_participation_revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle participation changed'; END IF;
 -- Compatible with moderation: cohort first, then membership/post authority.
 PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor FOR UPDATE;
 RETURN c;
END $$;
CREATE FUNCTION public._soe_circle_participation_bump(p_circle_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.book_cohorts SET circle_participation_revision=circle_participation_revision+1 WHERE id=p_circle_id AND circle_participation_revision<9007199254740991;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle revision unavailable'; END IF;
END $$;
CREATE FUNCTION public._soe_circle_participation_replay(p_actor uuid,p_request_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.circle_participation_receipts;
BEGIN
 IF p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='A request identifier is required'; END IF;
 SELECT * INTO r FROM public.circle_participation_receipts WHERE actor_member_id=p_actor AND request_id=p_request_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request identifier conflicts'; END IF;
 PERFORM 1 FROM public.book_cohorts WHERE id=r.cohort_id AND book_id='soe-circles-path' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 -- The actor owns this historical receipt. Replay grants no current membership
 -- and returns no listing, roster or private URL; only current self capability.
 RETURN jsonb_build_object('requestId',p_request_id,'circleId',r.cohort_id,'receipt',r.receipt,'state',public._soe_circle_participation_state(p_actor,r.cohort_id),'replayed',true);
END $$;
CREATE FUNCTION public._soe_circle_participation_remember(p_actor uuid,p_circle_id uuid,p_request_id uuid,p_payload jsonb,p_receipt jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 BEGIN
  INSERT INTO public.circle_participation_receipts(actor_member_id,request_id,cohort_id,payload,receipt) VALUES(p_actor,p_request_id,p_circle_id,p_payload,p_receipt);
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request identifier conflicts'; END;
 RETURN jsonb_build_object('requestId',p_request_id,'circleId',p_circle_id,'receipt',p_receipt,'state',public._soe_circle_participation_state(p_actor,p_circle_id),'replayed',false);
END $$;
CREATE FUNCTION public._soe_circle_participation_event(p_action text,p_member boolean,p_completed boolean,p_date date DEFAULT NULL,p_status text DEFAULT NULL) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('action',p_action,'joined',p_member,'completed',p_completed,'date',p_date,'status',p_status);
$$;
CREATE FUNCTION public._soe_circle_participation_active_hosted(p_actor uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT count(*) FROM public.book_cohorts c WHERE c.book_id='soe-circles-path' AND c.created_by=p_actor AND c.status IS DISTINCT FROM 'completed'
  AND (public._soe_circle_participation_dates(c) IS NULL OR public._soe_circle_participation_today(c) IS NULL OR (public._soe_circle_participation_dates(c))[12]>=public._soe_circle_participation_today(c));
$$;
CREATE FUNCTION public.soe_circle_start(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE n bigint; daily bigint;
BEGIN
 PERFORM public._soe_circle_participation_actor(p_actor);
 n:=public._soe_circle_participation_active_hosted(p_actor);
 SELECT count(*) INTO daily FROM public.circle_participation_receipts WHERE actor_member_id=p_actor AND receipt->>'action'='create' AND created_at>clock_timestamp()-interval '24 hours';
 RETURN jsonb_build_object('canCreate',n<3 AND daily<3,'activeHosted',n,'maxActiveHosted',3);
END $$;

CREATE FUNCTION public.soe_circle_create(p_actor uuid,p_request_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE payload jsonb; replay jsonb; start_day date; today date; c public.book_cohorts; n bigint; format text; venue text; online_url text;
BEGIN
 PERFORM public._soe_circle_participation_actor(p_actor);
 payload:=jsonb_build_object('action','create','input',p_input);
 replay:=public._soe_circle_participation_replay(p_actor,p_request_id,payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid Circle input'; END IF;
 IF NOT(p_input ?& ARRAY['title','description','format','city','region','venueName','venueType','weekday','time','timezone','startDate','maxMembers','onlineUrl'])
   OR p_input-ARRAY['title','description','format','city','region','venueName','venueType','weekday','time','timezone','startDate','maxMembers','onlineUrl']<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid Circle input'; END IF;
 format:=p_input->>'format'; venue:=p_input->>'venueType'; online_url:=p_input->>'onlineUrl';
 IF jsonb_typeof(p_input->'title') IS DISTINCT FROM 'string' OR length(btrim(p_input->>'title')) NOT BETWEEN 4 AND 120 OR length(p_input->>'title')>120
   OR (p_input->>'title') ~ '[[:cntrl:]]' OR (p_input->>'description') ~ '[[:cntrl:]]' OR length(p_input->>'description')>600
   OR (jsonb_typeof(p_input->'description') NOT IN('string','null')) OR jsonb_typeof(p_input->'format') IS DISTINCT FROM 'string' OR format NOT IN('in_person','online','hybrid')
   OR jsonb_typeof(p_input->'venueType') IS DISTINCT FROM 'string' OR venue NOT IN('library','cafe','community_center','campus','place_of_worship','other_public','online')
   OR (format='online' AND venue<>'online') OR (format<>'online' AND venue='online')
   OR jsonb_typeof(p_input->'weekday') IS DISTINCT FROM 'number' OR (p_input->>'weekday') !~ '^[0-6]$'
   OR jsonb_typeof(p_input->'maxMembers') IS DISTINCT FROM 'number' OR (p_input->>'maxMembers') !~ '^([3-9]|1[0-2])$'
   OR jsonb_typeof(p_input->'time') IS DISTINCT FROM 'string' OR (p_input->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR jsonb_typeof(p_input->'timezone') IS DISTINCT FROM 'string' OR (p_input->>'timezone') NOT IN('America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','UTC')
   OR jsonb_typeof(p_input->'startDate') IS DISTINCT FROM 'string' OR (p_input->>'startDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid Circle input'; END IF;
 IF jsonb_typeof(p_input->'city') NOT IN('string','null') OR length(p_input->>'city')>80 OR (p_input->>'city') ~ '[[:cntrl:]]'
   OR jsonb_typeof(p_input->'region') NOT IN('string','null') OR length(p_input->>'region')>40 OR (p_input->>'region') ~ '[[:cntrl:]]'
   OR jsonb_typeof(p_input->'venueName') NOT IN('string','null') OR length(p_input->>'venueName')>120 OR (p_input->>'venueName') ~ '[[:cntrl:]]'
   OR (format<>'online' AND (coalesce(length(btrim(p_input->>'city')),0)=0 OR coalesce(length(btrim(p_input->>'venueName')),0)=0))
   OR (format='online' AND (p_input->>'venueName') IS NOT NULL)
   OR jsonb_typeof(p_input->'onlineUrl') NOT IN('string','null') OR (format='in_person' AND online_url IS NOT NULL)
   OR (format<>'in_person' AND (online_url IS NULL OR length(online_url)>300 OR online_url !~ '^https://[^/@[:space:]:]+\.[^/@[:space:]:]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid Circle venue'; END IF;
 BEGIN start_day:=(p_input->>'startDate')::date; EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid Circle date'; END;
 today:=(clock_timestamp() AT TIME ZONE (p_input->>'timezone'))::date;
 IF start_day<today OR start_day>today+180 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Choose a start date within six months'; END IF;
 n:=public._soe_circle_participation_active_hosted(p_actor);
 IF n>=3 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Active hosted Circle limit reached'; END IF;
 SELECT count(*) INTO n FROM public.circle_participation_receipts WHERE actor_member_id=p_actor AND receipt->>'action'='create' AND created_at>clock_timestamp()-interval '24 hours';
 IF n>=3 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='New Circle creation is temporarily limited'; END IF;
 INSERT INTO public.book_cohorts(book_id,title,description,max_members,start_date,thinker_id,status,created_by,circle_format,circle_city,circle_region,circle_venue_name,circle_venue_type,circle_weekday,circle_time,circle_timezone,circle_path_id,circle_hidden,circle_participation_revision)
 VALUES('soe-circles-path',btrim(p_input->>'title'),p_input->>'description',(p_input->>'maxMembers')::integer,start_day::timestamp AT TIME ZONE 'UTC','socrates','forming',p_actor,format,p_input->>'city',p_input->>'region',p_input->>'venueName',venue,(p_input->>'weekday')::smallint,p_input->>'time',p_input->>'timezone','starter-12',false,1) RETURNING * INTO c;
 INSERT INTO public.book_cohort_members(cohort_id,member_id) VALUES(c.id,p_actor);
 IF online_url IS NOT NULL THEN INSERT INTO public.circle_private(cohort_id,online_url) VALUES(c.id,online_url); END IF;
 RETURN public._soe_circle_participation_remember(p_actor,c.id,p_request_id,payload,public._soe_circle_participation_event('create',true,false));
END $$;

CREATE FUNCTION public.soe_circle_join(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; payload jsonb; replay jsonb; state jsonb; n bigint; changed boolean;
BEGIN
 PERFORM public._soe_circle_participation_actor(p_actor);
 payload:=jsonb_build_object('action','join','circleId',p_circle_id,'expectedRevision',p_expected_revision);
 replay:=public._soe_circle_participation_replay(p_actor,p_request_id,payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 c:=public._soe_circle_participation_lock(p_actor,p_circle_id,p_expected_revision); state:=public._soe_circle_participation_state(p_actor,c.id);
 IF c.circle_hidden THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 IF NOT public._soe_circle_participation_header_usable(c) THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Circle configuration unavailable'; END IF;
 IF (state->>'ended')::boolean THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='This Circle is closed to new joins'; END IF;
 IF NOT (state->>'isMember')::boolean THEN
  SELECT count(*) INTO n FROM public.book_cohort_members WHERE cohort_id=c.id;
  IF c.max_members IS NULL OR c.max_members NOT BETWEEN 3 AND 12 OR n>=c.max_members THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='No place is available'; END IF;
  INSERT INTO public.book_cohort_members(cohort_id,member_id) VALUES(c.id,p_actor); changed:=FOUND;
  IF changed THEN PERFORM public._soe_circle_participation_bump(c.id); END IF;
 END IF;
 RETURN public._soe_circle_participation_remember(p_actor,c.id,p_request_id,payload,public._soe_circle_participation_event('join',true,c.status='completed'));
END $$;
CREATE FUNCTION public.soe_circle_leave(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; payload jsonb; replay jsonb; state jsonb; removed integer; rsvps integer;
BEGIN
 PERFORM public._soe_circle_participation_actor(p_actor);
 payload:=jsonb_build_object('action','leave','circleId',p_circle_id,'expectedRevision',p_expected_revision);
 replay:=public._soe_circle_participation_replay(p_actor,p_request_id,payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 c:=public._soe_circle_participation_lock(p_actor,p_circle_id,p_expected_revision); state:=public._soe_circle_participation_state(p_actor,c.id);
 IF c.circle_hidden AND NOT (state->>'isMember')::boolean AND NOT (state->>'isHost')::boolean THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 DELETE FROM public.circle_rsvps WHERE cohort_id=c.id AND member_id=p_actor; GET DIAGNOSTICS rsvps=ROW_COUNT;
 DELETE FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor; GET DIAGNOSTICS removed=ROW_COUNT;
 IF removed>0 OR rsvps>0 THEN PERFORM public._soe_circle_participation_bump(c.id); END IF;
 RETURN public._soe_circle_participation_remember(p_actor,c.id,p_request_id,payload,public._soe_circle_participation_event('leave',false,c.status='completed'));
END $$;
CREATE FUNCTION public.soe_circle_rsvp(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,p_request_id uuid,p_date date,p_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; payload jsonb; replay jsonb; state jsonb; dates date[]; changed integer;
BEGIN
 PERFORM public._soe_circle_participation_actor(p_actor);
 payload:=jsonb_build_object('action','rsvp','circleId',p_circle_id,'expectedRevision',p_expected_revision,'date',p_date,'status',p_status);
 replay:=public._soe_circle_participation_replay(p_actor,p_request_id,payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF p_status IS NULL OR p_status NOT IN('going','not_going') OR p_date IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid RSVP'; END IF;
 c:=public._soe_circle_participation_lock(p_actor,p_circle_id,p_expected_revision); state:=public._soe_circle_participation_state(p_actor,c.id);
 IF c.circle_hidden THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 IF NOT (state->>'isMember')::boolean THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Current membership required'; END IF;
 IF NOT public._soe_circle_participation_header_usable(c) THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Circle configuration unavailable'; END IF;
 IF NOT (state->>'canRsvp')::boolean THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='This Circle is closed to RSVPs'; END IF;
 dates:=public._soe_circle_participation_dates(c);
 IF NOT(p_date=ANY(dates)) OR p_date<public._soe_circle_participation_today(c) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Choose an upcoming configured meeting'; END IF;
 INSERT INTO public.circle_rsvps(cohort_id,member_id,meeting_date,status) VALUES(c.id,p_actor,p_date,p_status)
 ON CONFLICT(cohort_id,member_id,meeting_date) DO UPDATE SET status=excluded.status,updated_at=clock_timestamp() WHERE circle_rsvps.status IS DISTINCT FROM excluded.status;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed>0 THEN PERFORM public._soe_circle_participation_bump(c.id); END IF;
 RETURN public._soe_circle_participation_remember(p_actor,c.id,p_request_id,payload,public._soe_circle_participation_event('rsvp',true,false,p_date,p_status));
END $$;
CREATE FUNCTION public.soe_circle_complete(p_actor uuid,p_circle_id uuid,p_expected_revision bigint,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; payload jsonb; replay jsonb; member boolean;
BEGIN
 PERFORM public._soe_circle_participation_actor(p_actor);
 payload:=jsonb_build_object('action','complete','circleId',p_circle_id,'expectedRevision',p_expected_revision);
 replay:=public._soe_circle_participation_replay(p_actor,p_request_id,payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 c:=public._soe_circle_participation_lock(p_actor,p_circle_id,p_expected_revision);
 IF c.created_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Only the host can complete this Circle'; END IF;
 IF c.status IS DISTINCT FROM 'completed' THEN
  UPDATE public.book_cohorts SET status='completed' WHERE id=c.id; PERFORM public._soe_circle_participation_bump(c.id);
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor) INTO member;
 RETURN public._soe_circle_participation_remember(p_actor,c.id,p_request_id,payload,public._soe_circle_participation_event('complete',member,true));
END $$;

-- Public metadata plus only this viewer's membership/capabilities. No roster IDs.
CREATE FUNCTION public._soe_circle_participation_header(p_actor uuid,p_circle_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; state jsonb; host_name text; n bigint; dates date[]; next_meeting date;
BEGIN
 SELECT * INTO c FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path';
 IF NOT FOUND THEN RETURN NULL; END IF;
 state:=public._soe_circle_participation_state(p_actor,c.id); dates:=public._soe_circle_participation_dates(c);
 SELECT count(*) INTO n FROM public.book_cohort_members WHERE cohort_id=c.id;
 SELECT left(public._soe_circle_message_name(display_name),40) INTO host_name FROM public.members WHERE id=c.created_by;
 IF NOT (state->>'ended')::boolean AND NOT c.circle_hidden THEN SELECT min(day) INTO next_meeting FROM unnest(dates) day WHERE day>=public._soe_circle_participation_today(c); END IF;
 RETURN jsonb_build_object('kind','circle','circle',jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'max_members',c.max_members,'start_date',to_char(c.start_date AT TIME ZONE 'UTC','YYYY-MM-DD'),'status',c.status,'created_at',c.created_at,
  'circle_format',c.circle_format,'circle_city',c.circle_city,'circle_region',c.circle_region,'circle_venue_name',c.circle_venue_name,'circle_venue_type',c.circle_venue_type,'circle_weekday',c.circle_weekday,'circle_time',c.circle_time,'circle_timezone',c.circle_timezone,'circle_hidden',c.circle_hidden),
  'memberCount',n,'hostName',coalesce(host_name,'An explorer'),'revision',c.circle_participation_revision,'ended',(state->>'ended')::boolean,'nextMeeting',next_meeting,
  'viewer',jsonb_build_object('signed_in',p_actor IS NOT NULL,'is_member',(state->>'isMember')::boolean,'is_host',(state->>'isHost')::boolean),
  'capabilities',jsonb_build_object('canJoin',(state->>'canJoin')::boolean,'canLeave',(state->>'canLeave')::boolean,'canRsvp',(state->>'canRsvp')::boolean,'canComplete',(state->>'canComplete')::boolean,'canReadConversation',(state->>'canReadConversation')::boolean));
END $$;

-- A separately authorized self-management projection. It intentionally never
-- reads a calendar, RSVP, private URL, roster or report. Missing configuration
-- must not trap a current member or the recorded creator in a Circle.
CREATE FUNCTION public._soe_circle_participation_management(p_actor uuid,p_circle_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; member boolean; host boolean; title text;
BEGIN
 SELECT * INTO c FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path';
 IF NOT FOUND OR p_actor IS NULL THEN RETURN NULL; END IF;
 member:=EXISTS(SELECT 1 FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor);
 host:=coalesce(c.created_by=p_actor,false);
 IF NOT member AND NOT host THEN RETURN NULL; END IF;
 title:=CASE WHEN length(btrim(c.title)) BETWEEN 1 AND 200 AND length(c.title)<=200 AND c.title !~ '[[:cntrl:]]' THEN c.title ELSE NULL END;
 RETURN jsonb_build_object('kind','management','circle',jsonb_build_object('id',c.id,'title',title,'hidden',c.circle_hidden),
  'revision',c.circle_participation_revision,'viewer',jsonb_build_object('signed_in',true,'is_member',member,'is_host',host),
  'capabilities',jsonb_build_object('canLeave',member,'canComplete',host AND c.status IS DISTINCT FROM 'completed'));
END $$;
CREATE FUNCTION public.soe_circle_membership_state(p_actor uuid,p_circle_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member unavailable'; END IF;
 PERFORM 1 FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=p_circle_id AND member_id=p_actor FOR SHARE;
 result:=public._soe_circle_participation_management(p_actor,p_circle_id);
 IF result IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.soe_circle_detail(p_actor uuid,p_circle_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; state jsonb; header jsonb; dates date[]; meetings jsonb; online_url text;
BEGIN
 SELECT * INTO c FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 IF p_actor IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member unavailable'; END IF;
  PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor FOR SHARE;
 END IF;
 state:=public._soe_circle_participation_state(p_actor,c.id);
 IF c.circle_hidden AND NOT (state->>'isMember')::boolean AND NOT (state->>'isHost')::boolean THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Circle unavailable'; END IF;
 header:=public._soe_circle_participation_header(p_actor,c.id); dates:=public._soe_circle_participation_dates(c);
 IF dates IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Circle calendar unavailable'; END IF;
 IF c.circle_hidden OR (state->>'ended')::boolean THEN meetings:='[]'::jsonb;
 ELSE
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',day,'going',(SELECT count(*) FROM public.circle_rsvps r JOIN public.book_cohort_members m ON m.cohort_id=r.cohort_id AND m.member_id=r.member_id WHERE r.cohort_id=c.id AND r.meeting_date=day AND r.status='going'),
   'my_status',CASE WHEN (state->>'isMember')::boolean THEN (SELECT status FROM public.circle_rsvps WHERE cohort_id=c.id AND member_id=p_actor AND meeting_date=day) ELSE NULL END) ORDER BY day),'[]'::jsonb)
   INTO meetings FROM(SELECT day FROM unnest(dates) day WHERE day>=public._soe_circle_participation_today(c) ORDER BY day LIMIT 4) future;
 END IF;
 IF (state->>'isMember')::boolean AND NOT c.circle_hidden AND c.circle_format IN('online','hybrid') THEN
  SELECT p.online_url INTO online_url FROM public.circle_private p WHERE p.cohort_id=c.id;
  IF NOT FOUND OR online_url IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Private Circle configuration unavailable'; END IF;
 END IF;
 RETURN header||jsonb_build_object('ready',true,'meetings',meetings,'online_url',online_url);
END $$;
CREATE FUNCTION public.soe_circle_my_circles(p_actor uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; current_circle public.book_cohorts; state jsonb; items jsonb:='[]'::jsonb; n integer:=0; last_id uuid; more boolean:=false;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Member unavailable'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid Circle page'; END IF;
 -- Recheck relationship after taking each cohort lock; a delayed list cannot
 -- turn a departed membership into access. Stop after 25 actual items + lookahead.
 FOR c IN SELECT * FROM public.book_cohorts b WHERE b.book_id='soe-circles-path' AND (p_after IS NULL OR b.id>p_after)
   AND (b.created_by=p_actor OR EXISTS(SELECT 1 FROM public.book_cohort_members m WHERE m.cohort_id=b.id AND m.member_id=p_actor)) ORDER BY b.id LOOP
  SELECT * INTO current_circle FROM public.book_cohorts WHERE id=c.id AND book_id='soe-circles-path' FOR SHARE;
  IF NOT FOUND THEN CONTINUE; END IF;
  PERFORM 1 FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor FOR SHARE;
  state:=public._soe_circle_participation_state(p_actor,c.id);
  IF NOT (state->>'isMember')::boolean AND NOT (state->>'isHost')::boolean THEN CONTINUE; END IF;
  IF n=p_limit THEN more:=true; EXIT; END IF;
  IF public._soe_circle_participation_header_usable(current_circle) THEN
   items:=items||jsonb_build_array(public._soe_circle_participation_header(p_actor,c.id));
  ELSE
   items:=items||jsonb_build_array(public._soe_circle_participation_management(p_actor,c.id));
  END IF;
  n:=n+1; last_id:=c.id;
 END LOOP;
 RETURN jsonb_build_object('items',items,'nextCursor',CASE WHEN more THEN last_id ELSE NULL END);
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND (p.proname LIKE '_soe_circle_participation_%' OR p.proname IN('soe_circle_start','soe_circle_create','soe_circle_join','soe_circle_leave','soe_circle_rsvp','soe_circle_complete','soe_circle_detail','soe_circle_my_circles','soe_circle_membership_state')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
