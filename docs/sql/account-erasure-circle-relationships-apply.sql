-- Owner-reviewed draft for an isolated restore after the contact erasure draft.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE soe_account_deletion_private.circle_departure_receipts (
  request_id uuid PRIMARY KEY REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT,
  reviewed_scope jsonb NOT NULL,
  hosted_disposition_approved boolean NOT NULL,
  cleared_at timestamptz NOT NULL
);
CREATE TABLE soe_account_deletion_private.circle_departure_context (
  tx xid8 PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT
);
ALTER TABLE soe_account_deletion_private.circle_departure_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE soe_account_deletion_private.circle_departure_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON soe_account_deletion_private.circle_departure_receipts,soe_account_deletion_private.circle_departure_context
  FROM PUBLIC,anon,authenticated,service_role;

-- A completed Circle is an archive. Keep the valid listing, calendar and
-- membership rules while removing dependence on the former host's URL.
DO $$
DECLARE definition text;
  old_condition text;
  new_condition text;
  target record;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public._soe_circle_participation_header_usable(public.book_cohorts)'::regprocedure,
     '322adf9e5d4b37c8c153d09e1cd8514ecaee86957b13ace2ca812ea19c46e256',
     'c.circle_format IN(''online'',''hybrid'') THEN',
     'c.status IS DISTINCT FROM ''completed'' AND c.circle_format IN(''online'',''hybrid'') THEN'),
    ('public.soe_circle_detail(uuid,uuid)'::regprocedure,
     '8015f771fe2bd3b9e49a6aea0e1ffa9e397cbf0958876cbf0bfabf0153a426ea',
     'AND NOT c.circle_hidden AND c.circle_format IN(''online'',''hybrid'') THEN',
     'AND NOT c.circle_hidden AND NOT (state->>''ended'')::boolean AND c.circle_format IN(''online'',''hybrid'') THEN')
  ) AS f(signature,digest,before,after) LOOP
    SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc AS p
    WHERE p.oid=target.signature AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=target.digest
      AND NOT p.prosecdef AND pg_get_userbyid(p.proowner)=current_user;
    old_condition:=target.before;
    new_condition:=target.after;
    IF definition IS NULL OR length(definition)-length(replace(definition,old_condition,''))<>length(old_condition) THEN
      RAISE EXCEPTION 'Circle archive functions require review' USING ERRCODE='PT409';
    END IF;
    EXECUTE replace(definition,old_condition,new_condition);
  END LOOP;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.circle_departure_in_context(p_member uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM soe_account_deletion_private.circle_departure_context AS c
    JOIN soe_account_deletion_private.processing AS p USING (request_id)
    WHERE c.tx=pg_current_xact_id_if_assigned() AND p.member_id=p_member
  );
$$;

CREATE FUNCTION soe_account_deletion_private.guard_circle_relationship()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE previous uuid;
  actor uuid;
  approved_change jsonb;
BEGIN
  PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE='PT503';
  END IF;
  IF TG_OP='UPDATE' THEN previous:=(to_jsonb(OLD)->>TG_ARGV[0])::uuid; END IF;
  actor:=(to_jsonb(NEW)->>TG_ARGV[0])::uuid;
  IF TG_TABLE_NAME='circle_private' THEN
    IF EXISTS (
      SELECT 1 FROM public.book_cohorts AS c
      WHERE c.id IN (actor,previous) AND (c.created_by IS NULL OR EXISTS (
        SELECT 1 FROM soe_account_deletion_private.processing AS p WHERE p.member_id=c.created_by
      ))
    ) THEN
      RAISE EXCEPTION 'The Circle meeting link is unavailable' USING ERRCODE='PT403';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM soe_account_deletion_private.processing AS p WHERE p.member_id IN (actor,previous)) THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='book_cohorts' AND TG_OP='UPDATE'
    AND soe_account_deletion_private.circle_departure_in_context(previous) THEN
    approved_change:='{"created_by":null}'::jsonb;
    IF OLD.book_id='soe-circles-path' THEN approved_change:=approved_change||'{"status":"completed"}'::jsonb; END IF;
    IF to_jsonb(NEW)=to_jsonb(OLD)||approved_change THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Account removal is in progress' USING ERRCODE='PT403';
END;
$$;

CREATE TRIGGER soe_guard_circle_departure BEFORE INSERT OR UPDATE OF created_by ON public.book_cohorts
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_circle_relationship('created_by');
CREATE TRIGGER soe_guard_circle_departure BEFORE INSERT OR UPDATE ON public.book_cohort_members
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_circle_relationship('member_id');
CREATE TRIGGER soe_guard_circle_departure BEFORE INSERT OR UPDATE ON public.circle_rsvps
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_circle_relationship('member_id');
CREATE TRIGGER soe_guard_circle_departure BEFORE INSERT OR UPDATE ON public.circle_salon_presence
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_circle_relationship('member_id');
CREATE TRIGGER soe_guard_circle_departure BEFORE INSERT OR UPDATE ON public.circle_reviewer_grants
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_circle_relationship('member_id');
CREATE TRIGGER soe_guard_circle_departure BEFORE INSERT ON public.circle_participation_receipts
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_circle_relationship('actor_member_id');
CREATE TRIGGER soe_guard_circle_departure BEFORE INSERT OR UPDATE ON public.circle_private
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_circle_relationship('cohort_id');

CREATE FUNCTION soe_account_deletion_private.guard_circle_participation_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' AND soe_account_deletion_private.circle_departure_in_context(OLD.actor_member_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Participation receipts are immutable' USING ERRCODE='PT403';
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.circle_participation_receipts'::regclass
      AND tgname='circle_participation_receipts_immutable' AND tgtype=27 AND tgenabled='O'
      AND tgfoid='public._soe_circle_participation_immutable()'::regprocedure
  ) THEN RAISE EXCEPTION 'Participation receipt guard requires review' USING ERRCODE='PT409'; END IF;
END;
$$;
DROP TRIGGER circle_participation_receipts_immutable ON public.circle_participation_receipts;
CREATE TRIGGER circle_participation_receipts_immutable BEFORE UPDATE OR DELETE ON public.circle_participation_receipts
  FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_circle_participation_receipt();

CREATE FUNCTION soe_account_deletion_private.check_circle_departure_shape()
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE child_tables regclass[]:=ARRAY[
  'public.book_cohort_members','public.circle_rsvps','public.circle_salon_presence','public.circle_reviewer_grants',
  'public.circle_participation_receipts','public.circle_private'
]::regclass[];
  all_tables regclass[]:=child_tables||'public.book_cohorts'::regclass;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class=ANY(all_tables))
    OR EXISTS (
      SELECT 1 FROM pg_publication_tables AS p JOIN pg_class AS c ON c.relname=p.tablename
      WHERE p.schemaname='public' AND c.oid=ANY(all_tables)
    )
    OR EXISTS (
      SELECT 1 FROM unnest(all_tables) AS t(tbl) CROSS JOIN (VALUES ('anon'),('authenticated')) AS r(role_name)
      WHERE has_table_privilege(r.role_name,t.tbl,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
         OR has_any_column_privilege(r.role_name,t.tbl,'SELECT,INSERT,UPDATE')
    )
    OR EXISTS (
      SELECT 1 FROM pg_constraint AS f WHERE f.contype='f' AND (
        (f.confrelid=ANY(child_tables) AND NOT (
          f.confrelid='public.book_cohort_members'::regclass AND f.conrelid='public.circle_salon_presence'::regclass
          AND f.confdeltype='c' AND f.convalidated AND f.conkey=ARRAY[
            (SELECT attnum FROM pg_attribute WHERE attrelid=f.conrelid AND attname='cohort_id' AND NOT attisdropped),
            (SELECT attnum FROM pg_attribute WHERE attrelid=f.conrelid AND attname='member_id' AND NOT attisdropped)
          ]
          AND f.confkey=ARRAY[
            (SELECT attnum FROM pg_attribute WHERE attrelid=f.confrelid AND attname='cohort_id' AND NOT attisdropped),
            (SELECT attnum FROM pg_attribute WHERE attrelid=f.confrelid AND attname='member_id' AND NOT attisdropped)
          ]
        )) OR (f.confrelid='public.book_cohorts'::regclass AND EXISTS (
          SELECT 1 FROM pg_attribute AS a WHERE a.attrelid=f.confrelid AND a.attnum=ANY(f.confkey)
            AND a.attname IN ('created_by','status','circle_participation_revision')
        ))
      )
    )
    OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid='public.book_cohort_members'::regclass)<>1
    OR EXISTS (
      SELECT 1 FROM pg_trigger AS t WHERE NOT t.tgisinternal AND t.tgrelid=ANY(all_tables)
        AND (t.tgenabled<>'O' OR t.tgname NOT IN ('soe_guard_circle_departure','circle_participation_receipts_immutable',
          'circle_cohort_identity_immutable','circle_message_parent_retention','circle_participation_completion_terminal',
          'circle_reading_program_fixed','circle_review_coverage_circle_change','circle_review_coverage_grant_change'))
    )
    OR (
      SELECT count(*) FROM pg_trigger AS t WHERE t.tgname='soe_guard_circle_departure' AND t.tgenabled='O'
        AND t.tgrelid=ANY(all_tables) AND t.tgfoid='soe_account_deletion_private.guard_circle_relationship()'::regprocedure
        AND t.tgtype=CASE WHEN t.tgrelid='public.circle_participation_receipts'::regclass THEN 7 ELSE 23 END
    )<>cardinality(all_tables)
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid='public.circle_participation_receipts'::regclass
        AND tgname='circle_participation_receipts_immutable' AND tgtype=27 AND tgenabled='O'
        AND tgfoid='soe_account_deletion_private.guard_circle_participation_receipt()'::regprocedure
    ) THEN
    RAISE EXCEPTION 'Circle departure relationships require review' USING ERRCODE='PT409';
  END IF;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.circle_departure_scope(p_member uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog SET TimeZone = 'UTC' AS $$
  WITH hosted AS (SELECT * FROM public.book_cohorts WHERE created_by=p_member),
  roster AS (SELECT * FROM public.book_cohort_members WHERE member_id=p_member),
  rsvps AS (SELECT * FROM public.circle_rsvps WHERE member_id=p_member),
  circles AS (
    SELECT c.id,c.circle_participation_revision FROM public.book_cohorts AS c
    JOIN (SELECT id FROM hosted UNION SELECT cohort_id FROM roster UNION SELECT cohort_id FROM rsvps) AS affected ON affected.id=c.id
    WHERE c.book_id='soe-circles-path'
  ), records(kind,item) AS (
    SELECT 'hosted',to_jsonb(h) FROM hosted AS h
    UNION ALL SELECT 'membership',to_jsonb(m) FROM roster AS m
    UNION ALL SELECT 'rsvp',to_jsonb(r) FROM rsvps AS r
    UNION ALL SELECT 'circleRevision',to_jsonb(c) FROM circles AS c
    UNION ALL SELECT 'meetingLink',to_jsonb(p) FROM public.circle_private AS p JOIN hosted AS h ON h.id=p.cohort_id
    UNION ALL SELECT 'presence',to_jsonb(p) FROM public.circle_salon_presence AS p WHERE p.member_id=p_member
    UNION ALL SELECT 'reviewerGrant',to_jsonb(g) FROM public.circle_reviewer_grants AS g WHERE g.member_id=p_member
    UNION ALL SELECT 'receipt',to_jsonb(r) FROM public.circle_participation_receipts AS r WHERE r.actor_member_id=p_member
  ), digests AS (
    SELECT kind,encode(sha256(convert_to(item::text,'UTF8')),'hex') AS digest FROM records
  )
  SELECT jsonb_build_object(
    'hostedIds',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM hosted),'[]'::jsonb),
    'circleIds',coalesce((SELECT jsonb_agg(id ORDER BY id) FROM circles),'[]'::jsonb),
    'counts',coalesce((SELECT jsonb_object_agg(kind,n) FROM (SELECT kind,count(*) AS n FROM records GROUP BY kind) AS totals),'{}'::jsonb),
    'snapshot',encode(sha256(convert_to(coalesce(string_agg(kind||':'||digest,',' ORDER BY kind,digest),''),'UTF8')),'hex')
  ) FROM digests;
$$;

CREATE FUNCTION soe_account_deletion_private.preview_circle_departure(p_request uuid,p_member uuid,p_auth uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM soe_account_deletion_private.processing AS p WHERE p.request_id=p_request
      AND p.member_id IS NOT DISTINCT FROM p_member AND p.auth_user_id IS NOT DISTINCT FROM p_auth
  ) THEN RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE='PT409'; END IF;
  PERFORM soe_account_deletion_private.check_circle_departure_shape();
  RETURN soe_account_deletion_private.circle_departure_scope(p_member);
END;
$$;

CREATE FUNCTION soe_account_deletion_private.verify_circle_departure(p_member uuid,p_hosted uuid[])
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT (soe_account_deletion_private.circle_departure_scope(p_member)->'counts')='{}'::jsonb
    AND (SELECT count(*) FROM public.book_cohorts AS c WHERE c.id=ANY(p_hosted) AND c.created_by IS NULL
      AND (c.book_id IS DISTINCT FROM 'soe-circles-path' OR c.status='completed'))=cardinality(p_hosted)
    AND NOT EXISTS (SELECT 1 FROM public.circle_private WHERE cohort_id=ANY(p_hosted));
$$;

CREATE FUNCTION soe_account_deletion_private.erase_circle_departure(
  p_request uuid,p_member uuid,p_auth uuid,p_reviewed_scope jsonb,p_hosted_disposition_approved boolean
) RETURNS timestamptz LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog SET lock_timeout = '3s' AS $$
DECLARE hosted uuid[];
  scope jsonb;
  prior soe_account_deletion_private.circle_departure_receipts%ROWTYPE;
  finished_at timestamptz;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Clear Circle relationships in a read-committed transaction' USING ERRCODE='PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing AS p WHERE p.request_id=p_request
    AND p.member_id IS NOT DISTINCT FROM p_member AND p.auth_user_id IS NOT DISTINCT FROM p_auth FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE='PT409'; END IF;

  -- Take the normal participation actor lane even after the member row is
  -- removed by a later phase and an exact retry only verifies the receipt.
  IF p_member IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('soe-circle-participation:'||p_member::text,0));
  END IF;
  LOCK TABLE public.book_cohorts,public.book_cohort_members,public.circle_rsvps,public.circle_salon_presence,
    public.circle_reviewer_grants,public.circle_participation_receipts,public.circle_private IN ROW EXCLUSIVE MODE;
  PERFORM soe_account_deletion_private.check_circle_departure_shape();
  SELECT * INTO prior FROM soe_account_deletion_private.circle_departure_receipts WHERE request_id=p_request;
  IF FOUND THEN
    hosted:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(prior.reviewed_scope->'hostedIds'));
    IF prior.reviewed_scope IS DISTINCT FROM p_reviewed_scope
      OR prior.hosted_disposition_approved IS DISTINCT FROM p_hosted_disposition_approved
      OR NOT soe_account_deletion_private.verify_circle_departure(p_member,hosted) THEN
      RAISE EXCEPTION 'Circle departure requires review' USING ERRCODE='PT409';
    END IF;
    RETURN prior.cleared_at;
  END IF;

  -- Match the ordinary mutation order. The processing guards hold the actor
  -- boundary while other members may continue using their other Circles.
  PERFORM 1 FROM public.book_cohorts AS c WHERE c.created_by=p_member
    OR EXISTS (SELECT 1 FROM public.book_cohort_members AS m WHERE m.cohort_id=c.id AND m.member_id=p_member)
    OR EXISTS (SELECT 1 FROM public.circle_rsvps AS r WHERE r.cohort_id=c.id AND r.member_id=p_member)
    ORDER BY c.id FOR UPDATE;
  scope:=soe_account_deletion_private.circle_departure_scope(p_member);
  hosted:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(scope->'hostedIds'));
  IF scope IS DISTINCT FROM p_reviewed_scope OR p_hosted_disposition_approved IS NULL
    OR (cardinality(hosted)>0 AND NOT p_hosted_disposition_approved) THEN
    RAISE EXCEPTION 'Review current Circle data and hosted salon disposition' USING ERRCODE='PT409';
  END IF;

  INSERT INTO soe_account_deletion_private.circle_departure_context VALUES (pg_current_xact_id(),p_request);
  DELETE FROM public.circle_rsvps WHERE member_id=p_member;
  DELETE FROM public.book_cohort_members WHERE member_id=p_member;
  DELETE FROM public.circle_reviewer_grants WHERE member_id=p_member;
  DELETE FROM public.circle_participation_receipts WHERE actor_member_id=p_member;
  DELETE FROM public.circle_private WHERE cohort_id=ANY(hosted);
  UPDATE public.book_cohorts SET created_by=NULL,status=CASE WHEN book_id='soe-circles-path' THEN 'completed' ELSE status END
    WHERE id=ANY(hosted) AND created_by=p_member;
  PERFORM public._soe_circle_participation_bump(value::uuid)
    FROM jsonb_array_elements_text(scope->'circleIds');
  IF NOT soe_account_deletion_private.verify_circle_departure(p_member,hosted) THEN
    RAISE EXCEPTION 'Circle departure could not be verified' USING ERRCODE='PT409';
  END IF;
  DELETE FROM soe_account_deletion_private.circle_departure_context WHERE tx=pg_current_xact_id();
  finished_at:=clock_timestamp();
  INSERT INTO soe_account_deletion_private.circle_departure_receipts VALUES (p_request,scope,p_hosted_disposition_approved,finished_at);
  RETURN finished_at;
END;
$$;

REVOKE ALL ON FUNCTION
  soe_account_deletion_private.circle_departure_in_context(uuid),
  soe_account_deletion_private.guard_circle_relationship(),
  soe_account_deletion_private.guard_circle_participation_receipt(),
  soe_account_deletion_private.check_circle_departure_shape(),
  soe_account_deletion_private.circle_departure_scope(uuid),
  soe_account_deletion_private.preview_circle_departure(uuid,uuid,uuid),
  soe_account_deletion_private.verify_circle_departure(uuid,uuid[]),
  soe_account_deletion_private.erase_circle_departure(uuid,uuid,uuid,jsonb,boolean)
FROM PUBLIC,anon,authenticated,service_role;

DO $$
BEGIN
  PERFORM soe_account_deletion_private.check_circle_departure_shape();
  IF EXISTS (
    SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) AS r(role_name)
    WHERE pg_has_role(role_name,current_user,'MEMBER') OR EXISTS (
      SELECT 1 FROM (VALUES ('circle_departure_receipts'),('circle_departure_context')) AS t(name)
      WHERE has_table_privilege(r.role_name,'soe_account_deletion_private.'||t.name,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ) OR EXISTS (
      SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid=p.pronamespace
      WHERE n.nspname='soe_account_deletion_private'
        AND (p.proname LIKE '%circle_departure%' OR p.proname IN ('guard_circle_relationship','guard_circle_participation_receipt'))
        AND has_function_privilege(r.role_name,p.oid,'EXECUTE')
    )
  ) THEN RAISE EXCEPTION 'Unexpected Circle departure privileges'; END IF;
END;
$$;

COMMIT;
