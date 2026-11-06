-- Local review draft. Install after Core and Practice containment, before the matching app.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

CREATE FUNCTION public.soe_practice_response_save(p_actor uuid, p_question_id uuid, p_response_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog SET lock_timeout = '2s' AS $save$
DECLARE
  practice_day date;
  member_state record;
  saved record;
  first_answer boolean;
  streak integer;
BEGIN
  IF p_actor IS NULL OR p_question_id IS NULL OR p_response_text IS NULL
    OR length(p_response_text) NOT BETWEEN 1 AND 280 OR p_response_text !~ '[^[:space:]]'
    OR (SELECT sum(CASE WHEN ascii(ch) > 65535 THEN 2 ELSE 1 END)
        FROM regexp_split_to_table(p_response_text, '') AS chars(ch)) > 280 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid Practice answer.';
  END IF;

  -- Serialize the member counters first, then the shared prompt count.
  SELECT current_streak, longest_streak, last_practice_date, total_responses INTO member_state
    FROM public.members WHERE id = p_actor FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Practice account unavailable.';
  END IF;

  PERFORM 1 FROM public.daily_questions WHERE id = p_question_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Practice question unavailable.';
  END IF;
  practice_day := (clock_timestamp() AT TIME ZONE 'America/New_York')::date;

  INSERT INTO public.question_responses (member_id, question_id, response_text)
    VALUES (p_actor, p_question_id, p_response_text)
    ON CONFLICT (member_id, question_id) DO NOTHING
    RETURNING id, response_text, created_at INTO saved;
  first_answer := FOUND;
  IF NOT first_answer THEN
    UPDATE public.question_responses SET response_text = p_response_text
      WHERE member_id = p_actor AND question_id = p_question_id
      RETURNING id, response_text, created_at INTO saved;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Practice answer changed.';
    END IF;
  END IF;

  streak := CASE member_state.last_practice_date
    WHEN practice_day THEN coalesce(member_state.current_streak, 0)
    WHEN practice_day - 1 THEN coalesce(member_state.current_streak, 0) + 1
    ELSE 1
  END;
  UPDATE public.members AS m SET current_streak = streak,
    longest_streak = greatest(streak, coalesce(m.longest_streak, 0)),
    last_practice_date = practice_day,
    total_responses = coalesce(m.total_responses, 0) + first_answer::integer
    WHERE m.id = p_actor RETURNING m.current_streak, m.longest_streak, m.total_responses INTO member_state;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Practice account changed.'; END IF;

  UPDATE public.daily_questions SET engagement_score = (
    SELECT count(*) FROM public.question_responses WHERE question_id = p_question_id
  ) WHERE id = p_question_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Practice question changed.'; END IF;

  RETURN jsonb_build_object('response', to_jsonb(saved), 'streak', member_state.current_streak,
    'longest', member_state.longest_streak, 'total', member_state.total_responses);
END;
$save$;

REVOKE ALL ON FUNCTION public.soe_practice_response_save(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soe_practice_response_save(uuid, uuid, text) TO service_role;

DO $verify$
DECLARE
  save_oid oid := 'public.soe_practice_response_save(uuid,uuid,text)'::regprocedure;
  service_oid oid := 'service_role'::regrole;
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND proname = 'soe_practice_response_save') <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE oid = service_oid AND rolbypassrls
      AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication)
    OR NOT has_schema_privilege(service_oid, 'public', 'USAGE')
    OR EXISTS (
    SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid = save_oid AND a.grantee NOT IN (p.proowner, service_oid)
  ) OR EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon', 'authenticated']) AS browser(role_name)
    CROSS JOIN unnest(ARRAY['public.members', 'public.daily_questions', 'public.question_responses']) AS target(table_name)
    WHERE has_function_privilege(role_name, save_oid, 'EXECUTE')
      OR has_table_privilege(role_name, table_name, 'SELECT,INSERT,UPDATE,DELETE')
      OR has_any_column_privilege(role_name, table_name, 'SELECT,INSERT,UPDATE,REFERENCES')
  ) OR EXISTS (
    SELECT 1 FROM (VALUES ('public.members', 'SELECT'), ('public.members', 'UPDATE'),
      ('public.daily_questions', 'SELECT'), ('public.daily_questions', 'UPDATE'),
      ('public.question_responses', 'SELECT'), ('public.question_responses', 'INSERT'),
      ('public.question_responses', 'UPDATE')) AS needed(table_name, privilege)
    WHERE NOT has_table_privilege(service_oid, table_name, privilege)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Practice save authority requires review.';
  END IF;
END;
$verify$;
COMMIT;
