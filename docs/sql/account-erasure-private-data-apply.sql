-- Owner-reviewed draft. Apply after account-erasure-access-apply.sql on an
-- isolated restore. This phase covers reading, Thinker memory and Practice.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE soe_account_deletion_private.private_data_receipts (
  request_id uuid PRIMARY KEY REFERENCES soe_account_deletion_private.processing(request_id) ON DELETE RESTRICT,
  removed_counts jsonb NOT NULL CHECK (jsonb_typeof(removed_counts) = 'object'),
  cleared_at timestamptz NOT NULL
);
ALTER TABLE soe_account_deletion_private.private_data_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE soe_account_deletion_private.private_data_receipts FROM PUBLIC, anon, authenticated, service_role;

-- Order the explicit Practice reflection cleanup before removal of answers.
CREATE FUNCTION soe_account_deletion_private.private_data_tables()
RETURNS regclass[]
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT ARRAY[
    'public.reading_progress'::regclass, 'public.book_highlights'::regclass,
    'public.great_books_progress'::regclass, 'public.great_books_highlights'::regclass,
    'public.book_reflections'::regclass, 'public.thinker_memory'::regclass,
    'public.practice_reflections'::regclass, 'public.question_responses'::regclass
  ];
$$;

-- Share the identity lock so the owner-start operation waits for earlier
-- writes. A delayed response, including a generated reflection with a null
-- member_id, then sees the active removal fence before writing new data.
CREATE FUNCTION soe_account_deletion_private.guard_private_data_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  old_actor uuid;
  answer_actor uuid;
  old_answer_actor uuid;
BEGIN
  PERFORM revision FROM soe_account_deletion_private.identity_gate WHERE only_row FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account removal guard unavailable' USING ERRCODE = 'PT503';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    old_actor := OLD.member_id;
  END IF;
  IF TG_RELID = 'public.practice_reflections'::regclass THEN
    SELECT q.member_id INTO answer_actor FROM public.question_responses AS q WHERE q.id = NEW.response_id;
    IF TG_OP = 'UPDATE' THEN
      SELECT q.member_id INTO old_answer_actor FROM public.question_responses AS q WHERE q.id = OLD.response_id;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM soe_account_deletion_private.processing AS p
    WHERE p.member_id IN (NEW.member_id, old_actor, answer_actor, old_answer_actor)
  ) THEN
    RAISE EXCEPTION 'Account removal is in progress' USING ERRCODE = 'PT403';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  target regclass;
BEGIN
  FOREACH target IN ARRAY soe_account_deletion_private.private_data_tables() LOOP
    EXECUTE format(
      'CREATE TRIGGER soe_guard_private_data_erasure BEFORE INSERT OR UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION soe_account_deletion_private.guard_private_data_write()',
      target
    );
  END LOOP;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.check_private_data_shape()
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog
AS $$
DECLARE
  targets regclass[] := soe_account_deletion_private.private_data_tables();
  reflection_fk text := 'FOREIGN KEY (response_id) REFERENCES public.question_responses(id) ON DELETE CASCADE';
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class AS c WHERE c.oid = ANY (targets) AND (c.relkind <> 'r' OR c.relispartition)
  ) OR EXISTS (
    SELECT 1 FROM pg_inherits AS i WHERE i.inhrelid = ANY (targets) OR i.inhparent = ANY (targets)
  ) OR EXISTS (
    SELECT 1 FROM pg_rewrite AS r WHERE r.ev_class = ANY (targets)
  ) OR EXISTS (
    SELECT 1 FROM pg_trigger AS t
    WHERE t.tgrelid = ANY (targets) AND NOT t.tgisinternal AND (t.tgtype::int & 8) <> 0
  ) OR (
    SELECT count(*) FROM pg_trigger AS t
    WHERE t.tgrelid = ANY (targets) AND t.tgname = 'soe_guard_private_data_erasure'
      AND t.tgfoid = 'soe_account_deletion_private.guard_private_data_write()'::regprocedure
      AND t.tgenabled = 'O' AND t.tgtype = 23 AND t.tgqual IS NULL
  ) <> cardinality(targets)
  OR (
    SELECT count(*) FROM pg_constraint AS f
    WHERE f.contype = 'f' AND f.confrelid = ANY (targets)
  ) <> 1
  OR EXISTS (
    SELECT 1 FROM pg_trigger AS t
    WHERE t.tgrelid = 'public.daily_questions'::regclass AND NOT t.tgisinternal AND (t.tgtype::int & 16) <> 0
  )
  OR EXISTS (SELECT 1 FROM pg_rewrite AS r WHERE r.ev_class = 'public.daily_questions'::regclass)
  OR EXISTS (
    SELECT 1 FROM pg_constraint AS f
    JOIN pg_attribute AS a ON a.attrelid = f.confrelid AND a.attnum = ANY (f.confkey)
    WHERE f.contype = 'f' AND f.confrelid = 'public.daily_questions'::regclass AND a.attname = 'engagement_score'
  )
  OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS f
    WHERE f.contype = 'f' AND f.conrelid = 'public.practice_reflections'::regclass
      AND f.confrelid = 'public.question_responses'::regclass AND f.convalidated
      AND pg_get_constraintdef(f.oid) = reflection_fk
  ) THEN
    RAISE EXCEPTION 'Private data relationships require a new review' USING ERRCODE = 'PT409';
  END IF;
END;
$$;

-- The same counted owner predicate is used for review, deletion and readback.
-- Names come only from the fixed table list and never from request input.
CREATE FUNCTION soe_account_deletion_private.count_or_remove_private_data(p_member_id uuid, p_remove boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  target regclass;
  result jsonb := '{}'::jsonb;
  match_actor text;
  total bigint;
BEGIN
  FOREACH target IN ARRAY soe_account_deletion_private.private_data_tables() LOOP
    match_actor := 'r.member_id = $1';
    IF target = 'public.practice_reflections'::regclass THEN
      match_actor := match_actor || ' OR EXISTS (SELECT 1 FROM public.question_responses AS q
        WHERE q.id = r.response_id AND q.member_id = $1)';
    END IF;
    IF p_remove THEN
      EXECUTE format('DELETE FROM ONLY %s AS r WHERE %s', target, match_actor) USING p_member_id;
      GET DIAGNOSTICS total = ROW_COUNT;
    ELSE
      EXECUTE format('SELECT count(*) FROM ONLY %s AS r WHERE %s', target, match_actor)
        INTO total USING p_member_id;
    END IF;
    result := result || jsonb_build_object(target::text, total);
  END LOOP;
  RETURN result;
END;
$$;

CREATE FUNCTION soe_account_deletion_private.preview_private_data(
  p_request_id uuid, p_expected_member_id uuid, p_expected_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM soe_account_deletion_private.processing AS p
    WHERE p.request_id = p_request_id AND p.member_id IS NOT DISTINCT FROM p_expected_member_id
      AND p.auth_user_id IS NOT DISTINCT FROM p_expected_auth_user_id
  ) THEN
    RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE = 'PT409';
  END IF;
  PERFORM soe_account_deletion_private.check_private_data_shape();
  IF EXISTS (
    SELECT 1 FROM public.practice_reflections AS r
    JOIN public.question_responses AS q ON q.id = r.response_id
    WHERE q.member_id = p_expected_member_id AND r.member_id IS NOT NULL AND r.member_id <> q.member_id
  ) THEN
    RAISE EXCEPTION 'A linked reflection belongs to another member and requires review' USING ERRCODE = 'PT409';
  END IF;
  RETURN soe_account_deletion_private.count_or_remove_private_data(p_expected_member_id, false);
END;
$$;

CREATE FUNCTION soe_account_deletion_private.erase_private_data(
  p_request_id uuid, p_expected_member_id uuid, p_expected_auth_user_id uuid, p_reviewed_counts jsonb
)
RETURNS TABLE (removed_counts jsonb, cleared_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
SET lock_timeout = '3s'
AS $$
DECLARE
  current_counts jsonb;
  erased_counts jsonb;
  prior soe_account_deletion_private.private_data_receipts%ROWTYPE;
  empty_counts jsonb;
  finished_at timestamptz;
  practice_questions uuid[];
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Erase private data in a read-committed transaction' USING ERRCODE = 'PT409';
  END IF;
  PERFORM 1 FROM soe_account_deletion_private.processing AS p
    WHERE p.request_id = p_request_id AND p.member_id IS NOT DISTINCT FROM p_expected_member_id
      AND p.auth_user_id IS NOT DISTINCT FROM p_expected_auth_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No processing request matched the reviewed account' USING ERRCODE = 'PT409';
  END IF;
  LOCK TABLE public.reading_progress, public.book_highlights, public.great_books_progress,
    public.great_books_highlights, public.book_reflections, public.thinker_memory,
    public.practice_reflections, public.question_responses, public.daily_questions IN ROW EXCLUSIVE MODE;

  current_counts := soe_account_deletion_private.preview_private_data(
    p_request_id, p_expected_member_id, p_expected_auth_user_id);
  empty_counts := soe_account_deletion_private.count_or_remove_private_data(NULL, false);
  SELECT * INTO prior FROM soe_account_deletion_private.private_data_receipts AS q
    WHERE q.request_id = p_request_id;
  IF FOUND THEN
    IF current_counts <> empty_counts OR p_reviewed_counts IS DISTINCT FROM prior.removed_counts THEN
      RAISE EXCEPTION 'Private data state requires a new review' USING ERRCODE = 'PT409';
    END IF;
    RETURN QUERY SELECT prior.removed_counts, prior.cleared_at;
    RETURN;
  END IF;
  IF p_reviewed_counts IS DISTINCT FROM current_counts THEN
    RAISE EXCEPTION 'Private data counts changed; review the account again' USING ERRCODE = 'PT409';
  END IF;
  SELECT array_agg(DISTINCT q.question_id) INTO practice_questions
    FROM public.question_responses AS q WHERE q.member_id = p_expected_member_id;
  -- Share the prompt-row serialization used by the normal Practice writer.
  PERFORM 1 FROM public.daily_questions AS q
    WHERE q.id = ANY (practice_questions) ORDER BY q.id FOR NO KEY UPDATE;
  erased_counts := soe_account_deletion_private.count_or_remove_private_data(p_expected_member_id, true);
  UPDATE public.daily_questions AS q SET engagement_score = (
    SELECT count(*) FROM public.question_responses AS answer WHERE answer.question_id = q.id
  ) WHERE q.id = ANY (practice_questions);
  IF erased_counts <> current_counts OR
     soe_account_deletion_private.count_or_remove_private_data(p_expected_member_id, false) <> empty_counts THEN
    RAISE EXCEPTION 'Private data could not be verified as cleared' USING ERRCODE = 'PT409';
  END IF;
  finished_at := clock_timestamp();
  INSERT INTO soe_account_deletion_private.private_data_receipts (request_id, removed_counts, cleared_at)
    VALUES (p_request_id, erased_counts, finished_at);
  RETURN QUERY SELECT erased_counts, finished_at;
END;
$$;

REVOKE ALL ON FUNCTION
  soe_account_deletion_private.private_data_tables(),
  soe_account_deletion_private.guard_private_data_write(),
  soe_account_deletion_private.check_private_data_shape(),
  soe_account_deletion_private.count_or_remove_private_data(uuid, boolean),
  soe_account_deletion_private.preview_private_data(uuid, uuid, uuid),
  soe_account_deletion_private.erase_private_data(uuid, uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  PERFORM soe_account_deletion_private.check_private_data_shape();
  IF EXISTS (
    SELECT 1 FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS caller(role_name)
    WHERE pg_has_role(role_name, current_user, 'MEMBER')
      OR has_table_privilege(role_name, 'soe_account_deletion_private.private_data_receipts',
                             'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR EXISTS (
        SELECT 1 FROM pg_proc AS f JOIN pg_namespace AS n ON n.oid = f.pronamespace
        WHERE n.nspname = 'soe_account_deletion_private' AND f.proname IN (
          'private_data_tables', 'guard_private_data_write', 'check_private_data_shape',
          'count_or_remove_private_data', 'preview_private_data', 'erase_private_data'
        ) AND has_function_privilege(role_name, f.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected effective private erasure privileges';
  END IF;
END;
$$;

COMMIT;
