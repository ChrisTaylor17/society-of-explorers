-- Reviewed first-release change. Rehearse on an isolated restore before use.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

CREATE TABLE public.circle_salon_presence (
  cohort_id uuid NOT NULL,
  member_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL,
  PRIMARY KEY (cohort_id, member_id),
  FOREIGN KEY (cohort_id, member_id)
    REFERENCES public.book_cohort_members (cohort_id, member_id) ON DELETE CASCADE
);
ALTER TABLE public.circle_salon_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.circle_salon_presence FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.circle_salon_presence TO service_role;

CREATE FUNCTION public.soe_circle_salon_presence(p_actor uuid, p_circle_id uuid, p_lease_id uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog SET lock_timeout = '2s' AS $$
DECLARE
  checked_at timestamptz;
  present integer;
BEGIN
  IF p_actor IS NULL OR p_circle_id IS NULL OR p_lease_id IS NULL
     OR p_action IS NULL OR p_action NOT IN ('reserve', 'sync', 'leave') THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid salon check-in';
  END IF;

  -- Serialize against Circle visibility, completion and membership changes.
  -- The same member's requests take their membership lock before their seat.
  PERFORM 1 FROM public.book_cohorts
    WHERE id = p_circle_id AND book_id = 'soe-circles-path' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Salon unavailable'; END IF;

  PERFORM 1 FROM public.book_cohort_members
    WHERE cohort_id = p_circle_id AND member_id = p_actor FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Salon unavailable'; END IF;

  IF p_action = 'leave' THEN
    DELETE FROM public.circle_salon_presence
      WHERE cohort_id = p_circle_id AND member_id = p_actor AND lease_id = p_lease_id;
    RETURN jsonb_build_object('state', 'left');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.book_cohorts
    WHERE id = p_circle_id AND NOT circle_hidden AND status IS DISTINCT FROM 'completed'
      AND circle_format IN ('online', 'hybrid')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Salon unavailable';
  END IF;

  checked_at := clock_timestamp();
  IF p_action = 'reserve' THEN
    -- The reservation is invisible until the same authorized client checks in.
    INSERT INTO public.circle_salon_presence AS seat (cohort_id, member_id, lease_id, expires_at, active)
      VALUES (p_circle_id, p_actor, p_lease_id, checked_at + interval '15 seconds', false)
      ON CONFLICT (cohort_id, member_id) DO UPDATE
        SET lease_id = excluded.lease_id, expires_at = excluded.expires_at, active = false
        WHERE seat.expires_at <= checked_at;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Salon seat already reserved'; END IF;

    -- Bounded housekeeping. Ignore rows another caller is already changing.
    DELETE FROM public.circle_salon_presence AS expired
      USING (
        SELECT member_id FROM public.circle_salon_presence
        WHERE cohort_id = p_circle_id AND expires_at <= checked_at
        LIMIT 12 FOR UPDATE SKIP LOCKED
      ) AS stale
      WHERE expired.cohort_id = p_circle_id AND expired.member_id = stale.member_id;
    RETURN jsonb_build_object('state', 'reserved');
  END IF;

  UPDATE public.circle_salon_presence SET expires_at = checked_at + interval '35 seconds', active = true
    WHERE cohort_id = p_circle_id AND member_id = p_actor AND lease_id = p_lease_id AND expires_at > checked_at;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'PT410', MESSAGE = 'Salon seat expired'; END IF;

  SELECT count(*) INTO present FROM public.circle_salon_presence
    WHERE cohort_id = p_circle_id AND active AND expires_at > clock_timestamp();
  RETURN jsonb_build_object('state', 'present', 'count', present);
END $$;

REVOKE ALL ON FUNCTION public.soe_circle_salon_presence(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soe_circle_salon_presence(uuid, uuid, uuid, text) TO service_role;

DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(api_role, 'public.circle_salon_presence', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_function_privilege(api_role, 'public.soe_circle_salon_presence(uuid,uuid,uuid,text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected salon grant for %', api_role;
    END IF;
  END LOOP;
END $$;
COMMIT;
