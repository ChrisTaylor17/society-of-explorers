-- UNAPPLIED CANDIDATE DELTA. No production schema/data/grants were changed.
-- Apply only after the reviewed circle-participation.sql candidate and both
-- earlier moderation candidates in an authorized isolated restore.
-- This pins the locally reviewed reading editions. It grants no browser authority,
-- provisions no accounts/reviewers, and changes no retained discussion text.
-- Explicit sessions can skip passages and revisit earlier ranges; no coverage
-- claim or chronological reading order is inferred from these block positions.
-- Current primary-source review: Supabase database/functions and securing-your-api
-- docs; new-object grants changelog 2026-04-28 (existing-project rollout Oct 30).
-- Prefer SECURITY INVOKER and explicit function grants/revokes; RLS is separate.
-- https://supabase.com/docs/guides/database/functions
-- https://supabase.com/docs/guides/api/securing-your-api
-- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.soe_circle_create(uuid,uuid,jsonb)') IS NULL
   OR to_regprocedure('public._soe_circle_participation_dates(public.book_cohorts)') IS NULL
   OR to_regprocedure('public.soe_circle_membership_state(uuid,uuid)') IS NULL
   OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='book_cohorts' AND column_name='circle_participation_revision')
   OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND (rolbypassrls OR rolsuper)) THEN
  RAISE EXCEPTION 'Reviewed participation prerequisite is unavailable';
 END IF;
END $$;
ALTER TABLE public.book_cohorts ADD COLUMN circle_reading_program jsonb;

CREATE FUNCTION public._soe_circle_reading_editions() RETURNS TABLE(book_id text,edition_id text,block_count integer)
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 VALUES
  ('apology','pg-1656-c23a532ff45b46926abb91c193151af3f4aa8d27dc3bb76a3bb8971a427642c7',125),
  ('divine-comedy','pg-8800-e77de137b64fe83297c694a797430e09510f31591e099272edd1d49bdc9b94bb',440),
  ('genealogy-of-morals','pg-52319-50880f01d2e0afb107d49cb939f69086d3c1e6fccd2aad4ee68c329a1091e50c',347),
  ('hamlet','pg-1524-6bcc78cc0b21d3130b1a267990dd41b78f17785eeb089da3c5c9aa4eaac82825',1446),
  ('meditations','pg-2680-299ccec053a7da0dc33b3f1e32812fc1f33852ab962390f7680d925f015624d1',1186),
  ('odyssey','pg-1727-9328957b68516333c6c2f5618e8680f738c3f847756b777a94a5469231a9e569',1357),
  ('philemon','web-classic-b2bc6316f4217a8c97637d44786a4cd6b9b9a83b88cd4880b5aacdf67cae4e19',1),
  ('relativity','pg-5001-14298e92fba1f6f40331a878b6fda08a79cd348e928388f7f27f61b37243981c',550),
  ('republic','pg-1497-c0bf2b223089459d9868aaeb69f295b307734ec9c232a9dabc8c1f9b496dcfb4',4747);
$$;
CREATE FUNCTION public._soe_circle_reading_program_valid(p_program jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE blocks integer; session jsonb; first_block numeric; last_block numeric;
BEGIN
 IF p_program IS NULL OR jsonb_typeof(p_program) IS DISTINCT FROM 'object' OR octet_length(p_program::text)>8192 THEN RETURN false; END IF;
 IF NOT(p_program ?& ARRAY['version','bookId','editionId','sessions'])
  OR p_program-ARRAY['version','bookId','editionId','sessions']<>'{}'::jsonb
  OR p_program->'version' IS DISTINCT FROM '1'::jsonb
  OR jsonb_typeof(p_program->'bookId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_program->'editionId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_program->'sessions') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_program->'sessions') NOT BETWEEN 1 AND 12 THEN RETURN false; END IF;
 SELECT e.block_count INTO blocks FROM public._soe_circle_reading_editions() e
  WHERE e.book_id=p_program->>'bookId' AND e.edition_id=p_program->>'editionId';
 IF NOT FOUND THEN RETURN false; END IF;
 FOR session IN SELECT value FROM jsonb_array_elements(p_program->'sessions') LOOP
  IF jsonb_typeof(session) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF NOT(session ?& ARRAY['from','to']) OR session-ARRAY['from','to']<>'{}'::jsonb
   OR jsonb_typeof(session->'from') IS DISTINCT FROM 'number'
   OR jsonb_typeof(session->'to') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  first_block:=(session->>'from')::numeric; last_block:=(session->>'to')::numeric;
  IF first_block<>trunc(first_block) OR last_block<>trunc(last_block)
   OR first_block<0 OR last_block<first_block OR last_block>=blocks THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION public._soe_circle_reading_program_length(p_program jsonb,p_path_id text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_program IS NULL AND p_path_id='starter-12' THEN RETURN 12; END IF;
 IF p_path_id='book-v1' AND public._soe_circle_reading_program_valid(p_program) THEN RETURN jsonb_array_length(p_program->'sessions'); END IF;
 RETURN NULL;
END $$;

-- An inserted program/path is fixed. Later title, visibility and status review
-- updates continue to work; a damaged legacy row retains self-management escape.
CREATE FUNCTION public._soe_circle_reading_program_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.book_id IS DISTINCT FROM 'soe-circles-path' AND NEW.circle_reading_program IS NOT NULL THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Reading programs belong to Circles';
  END IF;
  IF (OLD.book_id='soe-circles-path' OR NEW.book_id='soe-circles-path')
   AND (NEW.circle_reading_program IS DISTINCT FROM OLD.circle_reading_program
    OR NEW.circle_path_id IS DISTINCT FROM OLD.circle_path_id OR NEW.book_id IS DISTINCT FROM OLD.book_id) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Circle reading program and path are immutable';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.book_id='soe-circles-path' THEN
  IF public._soe_circle_reading_program_length(NEW.circle_reading_program,NEW.circle_path_id) IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid Circle reading program or path';
  END IF;
 ELSIF NEW.circle_reading_program IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Reading programs belong to Circles';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER circle_reading_program_fixed BEFORE INSERT OR UPDATE OF book_id,circle_path_id,circle_reading_program ON public.book_cohorts
 FOR EACH ROW EXECUTE FUNCTION public._soe_circle_reading_program_guard();

CREATE OR REPLACE FUNCTION public._soe_circle_participation_dates(c public.book_cohorts) RETURNS date[] LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE first_day date; session_count integer;
BEGIN
 session_count:=public._soe_circle_reading_program_length(c.circle_reading_program,c.circle_path_id);
 IF session_count IS NULL THEN RETURN NULL; END IF;
 IF c.start_date IS NULL OR c.circle_weekday IS NULL OR c.circle_weekday NOT BETWEEN 0 AND 6
   OR c.circle_timezone IS NULL OR c.circle_timezone NOT IN('America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','UTC')
   OR c.circle_time IS NULL OR c.circle_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR c.status IS NULL OR c.status NOT IN('forming','active','completed') THEN RETURN NULL; END IF;
 first_day:=(c.start_date AT TIME ZONE 'UTC')::date;
 first_day:=first_day+((c.circle_weekday-extract(dow FROM first_day)::integer+7)%7);
 RETURN ARRAY(SELECT first_day+i*7 FROM generate_series(0,session_count-1) i ORDER BY i);
END $$;

CREATE OR REPLACE FUNCTION public._soe_circle_participation_state(p_actor uuid,p_circle_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; dates date[]; today date; member boolean; host boolean; ended boolean; completed boolean; configured boolean; n bigint;
BEGIN
 SELECT * INTO c FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path';
 IF NOT FOUND THEN RETURN NULL; END IF;
 dates:=public._soe_circle_participation_dates(c); today:=public._soe_circle_participation_today(c);
 configured:=public._soe_circle_participation_header_usable(c);
 member:=p_actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor);
 host:=coalesce(c.created_by=p_actor,false); completed:=coalesce(c.status='completed',false);
 ended:=completed OR dates IS NULL OR today IS NULL OR today>dates[array_length(dates,1)];
 SELECT count(*) INTO n FROM public.book_cohort_members WHERE cohort_id=c.id;
 RETURN jsonb_build_object('revision',c.circle_participation_revision,'isMember',member,'isHost',host,'hidden',c.circle_hidden,'completed',completed,'ended',ended,
  'canJoin',p_actor IS NOT NULL AND NOT member AND NOT c.circle_hidden AND NOT ended AND configured AND coalesce(c.max_members BETWEEN 3 AND 12 AND n<c.max_members,false),
  'canLeave',member,'canRsvp',member AND NOT c.circle_hidden AND NOT ended AND configured,'canComplete',host AND NOT completed,'canReadConversation',member AND NOT c.circle_hidden);
END $$;

CREATE OR REPLACE FUNCTION public._soe_circle_participation_active_hosted(p_actor uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT count(*) FROM public.book_cohorts c WHERE c.book_id='soe-circles-path' AND c.created_by=p_actor AND c.status IS DISTINCT FROM 'completed'
  AND (public._soe_circle_participation_dates(c) IS NULL OR public._soe_circle_participation_today(c) IS NULL OR (public._soe_circle_participation_dates(c))[array_length(public._soe_circle_participation_dates(c),1)]>=public._soe_circle_participation_today(c));
$$;

CREATE OR REPLACE FUNCTION public.soe_circle_create(p_actor uuid,p_request_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE payload jsonb; replay jsonb; start_day date; today date; c public.book_cohorts; n bigint; format text; venue text; online_url text;
BEGIN
 PERFORM public._soe_circle_participation_actor(p_actor);
 payload:=jsonb_build_object('action','create','input',p_input);
 replay:=public._soe_circle_participation_replay(p_actor,p_request_id,payload); IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid Circle input'; END IF;
 IF NOT(p_input ?& ARRAY['title','description','format','city','region','venueName','venueType','weekday','time','timezone','startDate','maxMembers','onlineUrl'])
   OR p_input-ARRAY['title','description','format','city','region','venueName','venueType','weekday','time','timezone','startDate','maxMembers','onlineUrl','readingProgram']<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid Circle input'; END IF;
 IF p_input ? 'readingProgram' AND NOT public._soe_circle_reading_program_valid(p_input->'readingProgram') THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid pinned reading program';
 END IF;
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
 INSERT INTO public.book_cohorts(book_id,title,description,max_members,start_date,thinker_id,status,created_by,circle_format,circle_city,circle_region,circle_venue_name,circle_venue_type,circle_weekday,circle_time,circle_timezone,circle_path_id,circle_hidden,circle_participation_revision,circle_reading_program)
 VALUES('soe-circles-path',btrim(p_input->>'title'),p_input->>'description',(p_input->>'maxMembers')::integer,start_day::timestamp AT TIME ZONE 'UTC','socrates','forming',p_actor,format,p_input->>'city',p_input->>'region',p_input->>'venueName',venue,(p_input->>'weekday')::smallint,p_input->>'time',p_input->>'timezone',CASE WHEN p_input ? 'readingProgram' THEN 'book-v1' ELSE 'starter-12' END,false,1,p_input->'readingProgram') RETURNING * INTO c;
 INSERT INTO public.book_cohort_members(cohort_id,member_id) VALUES(c.id,p_actor);
 IF online_url IS NOT NULL THEN INSERT INTO public.circle_private(cohort_id,online_url) VALUES(c.id,online_url); END IF;
 RETURN public._soe_circle_participation_remember(p_actor,c.id,p_request_id,payload,public._soe_circle_participation_event('create',true,false));
END $$;

CREATE OR REPLACE FUNCTION public._soe_circle_participation_header(p_actor uuid,p_circle_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.book_cohorts; state jsonb; host_name text; n bigint; dates date[]; next_meeting date;
BEGIN
 SELECT * INTO c FROM public.book_cohorts WHERE id=p_circle_id AND book_id='soe-circles-path';
 IF NOT FOUND THEN RETURN NULL; END IF;
 state:=public._soe_circle_participation_state(p_actor,c.id); dates:=public._soe_circle_participation_dates(c);
 SELECT count(*) INTO n FROM public.book_cohort_members WHERE cohort_id=c.id;
 SELECT left(public._soe_circle_message_name(display_name),40) INTO host_name FROM public.members WHERE id=c.created_by;
 IF NOT (state->>'ended')::boolean AND NOT c.circle_hidden THEN SELECT min(day) INTO next_meeting FROM unnest(dates) day WHERE day>=public._soe_circle_participation_today(c); END IF;
 RETURN jsonb_build_object('kind','circle','circle',jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'max_members',c.max_members,'start_date',to_char(c.start_date AT TIME ZONE 'UTC','YYYY-MM-DD'),'status',c.status,'created_at',c.created_at,
  'circle_format',c.circle_format,'circle_city',c.circle_city,'circle_region',c.circle_region,'circle_venue_name',c.circle_venue_name,'circle_venue_type',c.circle_venue_type,'circle_weekday',c.circle_weekday,'circle_time',c.circle_time,'circle_timezone',c.circle_timezone,'circle_hidden',c.circle_hidden,'circle_reading_program',c.circle_reading_program),
  'memberCount',n,'hostName',coalesce(host_name,'An explorer'),'revision',c.circle_participation_revision,'ended',(state->>'ended')::boolean,'nextMeeting',next_meeting,
  'viewer',jsonb_build_object('signed_in',p_actor IS NOT NULL,'is_member',(state->>'isMember')::boolean,'is_host',(state->>'isHost')::boolean),
  'capabilities',jsonb_build_object('canJoin',(state->>'canJoin')::boolean,'canLeave',(state->>'canLeave')::boolean,'canRsvp',(state->>'canRsvp')::boolean,'canComplete',(state->>'canComplete')::boolean,'canReadConversation',(state->>'canReadConversation')::boolean));
END $$;

-- Existing create-or-replace ACLs are narrowed again explicitly. New helpers
-- receive no PUBLIC/anon/authenticated execution through Postgres defaults.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE '_soe_circle_reading_%' OR p.proname IN(
   '_soe_circle_participation_dates','_soe_circle_participation_state','_soe_circle_participation_active_hosted',
   'soe_circle_create','_soe_circle_participation_header')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
