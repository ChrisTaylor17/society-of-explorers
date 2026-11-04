-- UNAPPLIED CANDIDATE. Read-only public discovery through a service-only RPC.
-- Apply after reviewed participation/reading-program SQL and the generated
-- circle-discovery-unicode.sql profile. No prior function/table is replaced.
-- STABLE functions share the calling statement's MVCC snapshot; no row locks,
-- provisioning, cached directory, user-data mutation or browser grants occur.
-- Calendar continuation detects any supported-zone local-day change. Results
-- are live per-page views, not a frozen multi-request inventory.
-- https://supabase.com/docs/guides/database/functions
-- https://www.postgresql.org/docs/17/xfunc-volatility.html
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public._soe_circle_discovery_fold(text)') IS NULL
 OR to_regprocedure('public._soe_circle_discovery_utf16_key(text)') IS NULL
 OR public._soe_circle_discovery_unicode_identity()<>'1a5d9e993d454b38d9ccf926de50aed56cf885d813df1a203566dea1839b0ebf'
 OR to_regprocedure('public._soe_circle_participation_header_usable(public.book_cohorts)') IS NULL
 OR to_regprocedure('public._soe_circle_participation_dates(public.book_cohorts)') IS NULL
 OR to_regprocedure('public._soe_circle_reading_program_length(jsonb,text)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND (rolbypassrls OR rolsuper)) THEN
  RAISE EXCEPTION 'Reviewed discovery prerequisites are unavailable';
 END IF;
END $$;

CREATE FUNCTION public._soe_circle_discovery_calendar_key(p_at timestamptz) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to('['||string_agg('["'||zone||'","'||to_char(p_at AT TIME ZONE zone,'YYYY-MM-DD')||'"]',',' ORDER BY ordinal)||']','UTF8')),'hex')
 FROM unnest(ARRAY['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','UTC']) WITH ORDINALITY zones(zone,ordinal);
$$;

CREATE FUNCTION public._soe_circle_discovery_dates(c public.book_cohorts) RETURNS date[]
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE dates date[];day date;
BEGIN
 -- Dates and strict configuration are checked before pagination can limit rows.
 -- In particular, neither created_at nor the request clock invents a start.
 IF c.book_id IS DISTINCT FROM 'soe-circles-path' OR c.circle_hidden IS DISTINCT FROM false
 OR c.status IS NULL OR c.status NOT IN('forming','active') OR c.start_date IS NULL OR NOT isfinite(c.start_date)
 OR extract(year FROM c.start_date AT TIME ZONE 'UTC') NOT BETWEEN 1 AND 9999
 OR length(public._soe_circle_discovery_trim(c.title))=0
 OR NOT public._soe_circle_participation_header_usable(c) THEN RETURN NULL;END IF;
 dates:=public._soe_circle_participation_dates(c);
 IF dates IS NULL OR array_length(dates,1) NOT BETWEEN 1 AND 12 THEN RETURN NULL;END IF;
 FOREACH day IN ARRAY dates LOOP
  IF day IS NULL OR NOT isfinite(day) OR extract(year FROM day) NOT BETWEEN 1 AND 9999 THEN RETURN NULL;END IF;
 END LOOP;
 RETURN dates;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range OR invalid_parameter_value THEN
 -- Malformed retained legacy configuration is not a directory-wide outage.
 RETURN NULL;
END $$;

CREATE FUNCTION public._soe_circle_discovery_host(p_name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE name text:=public._soe_circle_discovery_trim(p_name);
BEGIN
 IF name IS NULL OR length(name)=0 OR strpos(name,'@')>0 OR name ~ '[\x01-\x1f\x7f]' THEN RETURN 'An explorer';END IF;
 RETURN public._soe_circle_discovery_clip(name,40);
END $$;

CREATE FUNCTION public._soe_circle_discovery_catalog_valid(p_catalog jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE entry jsonb;heading jsonb;key text;weeks integer[]:='{}';books text[]:='{}';index_value numeric;expected integer;
BEGIN
 IF p_catalog IS NULL OR jsonb_typeof(p_catalog) IS DISTINCT FROM 'object' OR octet_length(p_catalog::text)>524288
 OR NOT(p_catalog ?& ARRAY['version','starter','editions']) OR p_catalog-ARRAY['version','starter','editions']<>'{}'
 OR p_catalog->'version' IS DISTINCT FROM '1'::jsonb
 OR jsonb_typeof(p_catalog->'starter') IS DISTINCT FROM 'array' OR jsonb_array_length(p_catalog->'starter')<>12
 OR jsonb_typeof(p_catalog->'editions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_catalog->'editions')<>8 THEN RETURN false;END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_catalog->'starter') LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR NOT(entry ?& ARRAY['week','title','author','selection'])
  OR entry-ARRAY['week','title','author','selection']<>'{}' OR jsonb_typeof(entry->'week') IS DISTINCT FROM 'number' THEN RETURN false;END IF;
  index_value:=(entry->>'week')::numeric;IF index_value<>trunc(index_value) OR index_value NOT BETWEEN 1 AND 12 OR index_value::integer=ANY(weeks) THEN RETURN false;END IF;
  weeks:=array_append(weeks,index_value::integer);
  FOREACH key IN ARRAY ARRAY['title','author','selection'] LOOP
   IF jsonb_typeof(entry->key) IS DISTINCT FROM 'string' OR length(entry->>key)>2000
    OR (entry->>key) ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RETURN false;END IF;
  END LOOP;
 END LOOP;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_catalog->'editions') LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR NOT(entry ?& ARRAY['bookId','editionId','blockCount','title','author','sourceTitle','contents'])
  OR entry-ARRAY['bookId','editionId','blockCount','title','author','sourceTitle','contents']<>'{}'
  OR jsonb_typeof(entry->'blockCount') IS DISTINCT FROM 'number' OR jsonb_typeof(entry->'contents') IS DISTINCT FROM 'array'
  OR jsonb_array_length(entry->'contents')>200 THEN RETURN false;END IF;
  SELECT e.block_count INTO expected FROM public._soe_circle_reading_editions() e WHERE e.book_id=entry->>'bookId' AND e.edition_id=entry->>'editionId';
  IF NOT FOUND OR entry->>'bookId'=ANY(books) OR (entry->>'blockCount')::numeric<>expected THEN RETURN false;END IF;
  books:=array_append(books,entry->>'bookId');
  FOREACH key IN ARRAY ARRAY['bookId','editionId','title','author','sourceTitle'] LOOP
   IF jsonb_typeof(entry->key) IS DISTINCT FROM 'string' OR length(entry->>key)>2000
    OR (entry->>key) ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RETURN false;END IF;
  END LOOP;
  FOR heading IN SELECT value FROM jsonb_array_elements(entry->'contents') LOOP
   IF jsonb_typeof(heading) IS DISTINCT FROM 'object' OR NOT(heading ?& ARRAY['readingIndex','label'])
    OR heading-ARRAY['readingIndex','label']<>'{}' OR jsonb_typeof(heading->'label') IS DISTINCT FROM 'string' OR length(heading->>'label')>2000
    OR (heading->>'label') ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RETURN false;END IF;
   IF heading->'readingIndex'<>'null'::jsonb THEN
    IF jsonb_typeof(heading->'readingIndex') IS DISTINCT FROM 'number' THEN RETURN false;END IF;
    index_value:=(heading->>'readingIndex')::numeric;
    IF index_value<>trunc(index_value) OR index_value<0 OR index_value>=expected THEN RETURN false;END IF;
   END IF;
  END LOOP;
 END LOOP;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;

CREATE FUNCTION public._soe_circle_discovery_session_label(p_edition jsonb,p_session jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE first_index integer:=(p_session->>'from')::integer;last_index integer:=(p_session->>'to')::integer;
 blocks integer:=(p_edition->>'blockCount')::integer;first_label text;after_label text;
BEGIN
 IF first_index=0 AND last_index=blocks-1 THEN RETURN 'Complete source edition';END IF;
 SELECT value->>'label' INTO first_label FROM jsonb_array_elements(p_edition->'contents') WHERE value->>'readingIndex'=first_index::text LIMIT 1;
 SELECT value->>'label' INTO after_label FROM jsonb_array_elements(p_edition->'contents') WHERE value->>'readingIndex'=(last_index+1)::text LIMIT 1;
 RETURN CASE WHEN first_index=0 THEN 'Opening pages' ELSE coalesce(first_label,'Reading position '||(first_index+1)::text) END
  ||' — '||CASE WHEN last_index=blocks-1 THEN 'end of edition' WHEN after_label IS NOT NULL THEN 'before '||after_label ELSE 'through reading position '||(last_index+1)::text END;
END $$;

CREATE FUNCTION public.soe_circle_discovery_search(p_query jsonb,p_catalog jsonb,p_after jsonb DEFAULT NULL,p_calendar_key text DEFAULT NULL,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE at_time timestamptz:=statement_timestamp();calendar_key text;entry jsonb;field text;term text;
 qterms text[]:='{}';cityterms text[]:='{}';after_date date;after_key bytea;after_id uuid;items jsonb;next_value jsonb;rows_json jsonb;
BEGIN
 IF public._soe_circle_discovery_unicode_identity()<>'1a5d9e993d454b38d9ccf926de50aed56cf885d813df1a203566dea1839b0ebf' THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Discovery Unicode profile unavailable';END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 OR p_query IS NULL OR jsonb_typeof(p_query) IS DISTINCT FROM 'object'
 OR octet_length(p_query::text)>65536 OR NOT(p_query ?& ARRAY['terms','cityTerms','format','open','sort','book','edition'])
 OR p_query-ARRAY['terms','cityTerms','format','open','sort','book','edition']<>'{}'
 OR jsonb_typeof(p_query->'terms') IS DISTINCT FROM 'array' OR jsonb_typeof(p_query->'cityTerms') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_query->'terms')>1000 OR jsonb_array_length(p_query->'cityTerms')>1000
 OR p_query->>'format' NOT IN('','in_person','online') OR jsonb_typeof(p_query->'format') IS DISTINCT FROM 'string'
 OR p_query->>'sort' NOT IN('next','title') OR jsonb_typeof(p_query->'sort') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_query->'open') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid discovery request';END IF;
 IF NOT((p_query->'book'='null'::jsonb AND p_query->'edition'='null'::jsonb)
 OR (jsonb_typeof(p_query->'book')='string' AND jsonb_typeof(p_query->'edition')='string'
  AND EXISTS(SELECT 1 FROM public._soe_circle_reading_editions() e WHERE e.book_id=p_query->>'book' AND e.edition_id=p_query->>'edition'))) THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid reading edition';END IF;
 FOREACH field IN ARRAY ARRAY['terms','cityTerms'] LOOP
  FOR entry IN SELECT value FROM jsonb_array_elements(p_query->field) LOOP
   IF jsonb_typeof(entry) IS DISTINCT FROM 'string' OR length(entry#>>'{}')>10000
    OR (entry#>>'{}') ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid search terms';END IF;
   term:=public._soe_circle_discovery_fold(entry#>>'{}');
   IF field='terms' THEN qterms:=array_append(qterms,term);ELSE cityterms:=array_append(cityterms,term);END IF;
  END LOOP;
 END LOOP;
 IF NOT public._soe_circle_discovery_catalog_valid(p_catalog) THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Discovery catalog unavailable';END IF;
 calendar_key:=public._soe_circle_discovery_calendar_key(at_time);
 IF (p_after IS NULL) IS DISTINCT FROM (p_calendar_key IS NULL) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid discovery continuation';END IF;
 IF p_calendar_key IS NOT NULL THEN
  IF p_calendar_key!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid discovery calendar';END IF;
  IF p_calendar_key<>calendar_key THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='The discovery calendar changed';END IF;
 END IF;
 IF p_after IS NOT NULL THEN
  IF jsonb_typeof(p_after) IS DISTINCT FROM 'object' OR NOT(p_after ?& ARRAY['nextMeeting','title','id'])
  OR p_after-ARRAY['nextMeeting','title','id']<>'{}' OR jsonb_typeof(p_after->'nextMeeting') IS DISTINCT FROM 'string'
  OR (p_after->>'nextMeeting')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR jsonb_typeof(p_after->'title') IS DISTINCT FROM 'string'
  OR length(p_after->>'title') NOT BETWEEN 1 AND 200 OR (p_after->>'title') ~ '[[:cntrl:]]'
  OR length(public._soe_circle_discovery_trim(p_after->>'title'))=0
  OR jsonb_typeof(p_after->'id') IS DISTINCT FROM 'string' OR (p_after->>'id')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid discovery position';END IF;
  BEGIN
   after_date:=(p_after->>'nextMeeting')::date;after_id:=(p_after->>'id')::uuid;
   IF to_char(after_date,'YYYY-MM-DD')<>p_after->>'nextMeeting' OR extract(year FROM after_date) NOT BETWEEN 1 AND 9999 THEN RAISE invalid_datetime_format;END IF;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid discovery position';END;
  after_key:=public._soe_circle_discovery_utf16_key(public._soe_circle_discovery_fold(p_after->>'title'));
 END IF;
 -- Configuration permissions/schema must be present even if no online row is
 -- currently returned; the inherited predicate deliberately catches such errors
 -- for membership management and must not silently erase this public inventory.
 PERFORM p.cohort_id,p.online_url FROM public.circle_private p LIMIT 0;

 WITH configured AS MATERIALIZED (
  SELECT c,public._soe_circle_discovery_dates(c) AS dates,public._soe_circle_participation_today(c) AS today
  FROM public.book_cohorts c WHERE c.book_id='soe-circles-path' AND c.circle_hidden=false AND c.status IN('forming','active')
   AND (p_query->>'book' IS NULL OR (c.circle_reading_program->>'bookId'=p_query->>'book' AND c.circle_reading_program->>'editionId'=p_query->>'edition'))
   AND (p_query->>'format'='' OR (p_query->>'format'='online' AND c.circle_format IN('online','hybrid')) OR (p_query->>'format'='in_person' AND c.circle_format IN('in_person','hybrid')))
 ), eligible AS MATERIALIZED (
  SELECT (c).*,dates,today,(SELECT min(day) FROM unnest(dates) day WHERE day>=today) AS next_day
  FROM configured WHERE dates IS NOT NULL AND today IS NOT NULL AND today<=dates[array_length(dates,1)]
 ), public_rows AS MATERIALIZED (
  SELECT e.*,coalesce(m.n,0) AS member_count,public._soe_circle_discovery_host(h.display_name) AS host_name,
   array_position(e.dates,e.next_day) AS current_week
  FROM eligible e LEFT JOIN LATERAL(SELECT count(*) AS n FROM public.book_cohort_members m WHERE m.cohort_id=e.id)m ON true
   LEFT JOIN public.members h ON h.id=e.created_by
 ), available AS MATERIALIZED (
  SELECT * FROM public_rows r WHERE NOT(p_query->>'open')::boolean OR r.member_count<r.max_members
 ), searchable AS MATERIALIZED (
  -- Empty filters do not need expensive Unicode or catalog-label work. Cheap
  -- book/format/seat predicates run before any full public haystack is folded.
  SELECT r.*,CASE WHEN cardinality(qterms)>0 THEN public._soe_circle_discovery_fold(concat_ws(' ',r.title,r.description,r.host_name,
   starter.value->>'title',starter.value->>'author',starter.value->>'selection',edition.value->>'title',edition.value->>'author',edition.value->>'sourceTitle',
   CASE WHEN r.circle_reading_program IS NOT NULL THEN public._soe_circle_discovery_session_label(edition.value,r.circle_reading_program->'sessions'->(r.current_week-1)) END)) ELSE '' END AS haystack,
   CASE WHEN cardinality(cityterms)>0 THEN public._soe_circle_discovery_fold(concat_ws(' ',r.circle_city,r.circle_region)) ELSE '' END AS city_haystack
  FROM available r
  LEFT JOIN LATERAL(SELECT value FROM jsonb_array_elements(p_catalog->'starter') WHERE (value->>'week')::integer=r.current_week AND r.circle_reading_program IS NULL LIMIT 1)starter ON true
  LEFT JOIN LATERAL(SELECT value FROM jsonb_array_elements(p_catalog->'editions') WHERE value->>'bookId'=r.circle_reading_program->>'bookId' AND value->>'editionId'=r.circle_reading_program->>'editionId' LIMIT 1)edition ON true
 ), filtered AS (
  SELECT * FROM searchable r WHERE
   NOT EXISTS(SELECT 1 FROM unnest(qterms)t WHERE strpos(r.haystack,t)=0)
   AND NOT EXISTS(SELECT 1 FROM unnest(cityterms)t WHERE strpos(r.city_haystack,t)=0)
 ), ordered AS MATERIALIZED (
  SELECT r.*,public._soe_circle_discovery_utf16_key(public._soe_circle_discovery_fold(r.title)) AS title_key FROM filtered r
 ), page AS (
  SELECT * FROM ordered r WHERE p_after IS NULL OR (CASE WHEN p_query->>'sort'='next' THEN (r.next_day,r.title_key,r.id)>(after_date,after_key,after_id) ELSE (r.title_key,r.id)>(after_key,after_id) END)
  ORDER BY CASE WHEN p_query->>'sort'='next' THEN next_day END,title_key,id LIMIT p_limit+1
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('circle',jsonb_build_object(
  'id',id,'title',title,'description',description,'max_members',max_members,'start_date',to_char(start_date AT TIME ZONE 'UTC','YYYY-MM-DD'),
  'status',status,'created_at',CASE WHEN created_at IS NOT NULL AND isfinite(created_at) AND extract(year FROM created_at AT TIME ZONE 'UTC') BETWEEN 1 AND 9999 THEN to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE NULL END,
  'circle_format',circle_format,'circle_city',circle_city,'circle_region',circle_region,'circle_venue_name',circle_venue_name,'circle_venue_type',circle_venue_type,
  'circle_weekday',circle_weekday,'circle_time',circle_time,'circle_timezone',circle_timezone,'circle_path_id',circle_path_id,'circle_reading_program',circle_reading_program),
  'memberCount',member_count,'hostName',host_name,'nextMeeting',to_char(next_day,'YYYY-MM-DD'),'firstMeeting',to_char(dates[1],'YYYY-MM-DD'),
  'week',current_week,'programLength',array_length(dates,1),'phase',CASE WHEN dates[1]>today THEN 'upcoming' ELSE 'in_progress' END)
  ORDER BY CASE WHEN p_query->>'sort'='next' THEN next_day END,title_key,id),'[]'::jsonb) INTO rows_json FROM page;
 SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO items FROM jsonb_array_elements(rows_json) WITH ORDINALITY entries(value,ordinal) WHERE ordinal<=p_limit;
 IF jsonb_array_length(rows_json)>p_limit THEN
  entry:=items->(p_limit-1);next_value:=jsonb_build_object('nextMeeting',entry->>'nextMeeting','title',entry->'circle'->>'title','id',entry->'circle'->>'id');
 ELSE next_value:=NULL;END IF;
 RETURN jsonb_build_object('asOf',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'calendarKey',calendar_key,'items',items,'next',next_value,'limit',p_limit);
END $$;

DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname='soe_circle_discovery_search' OR p.proname IN('_soe_circle_discovery_calendar_key','_soe_circle_discovery_dates','_soe_circle_discovery_host','_soe_circle_discovery_catalog_valid','_soe_circle_discovery_session_label')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
 END LOOP;
END $$;
COMMIT;
