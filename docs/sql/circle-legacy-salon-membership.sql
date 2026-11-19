-- UNAPPLIED LOCAL CANDIDATE. Prepare this controlled legacy writer before the
-- admission candidate removes raw service membership INSERT authority.
-- Only authenticated server callers can invoke it. It never joins SoE Circles.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
 IF to_regnamespace('soe_circle_admission_private') IS NOT NULL
  OR to_regprocedure('public._soe_circle_participation_actor(uuid)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND (rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Reviewed legacy membership prerequisites require review';
 END IF;
END $$;
CREATE SCHEMA soe_circle_admission_private;
REVOKE ALL ON SCHEMA soe_circle_admission_private FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA soe_circle_admission_private TO service_role;
CREATE FUNCTION soe_circle_admission_private.legacy_salon_join(p_actor uuid,p_cohort_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.book_cohorts; n bigint;
BEGIN
 PERFORM public._soe_circle_participation_actor(p_actor);
 SELECT * INTO c FROM public.book_cohorts WHERE id=p_cohort_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Book salon unavailable'; END IF;
 IF c.book_id IS NULL OR c.book_id='soe-circles-path' THEN
  RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Use the reviewed Circle membership flow';
 END IF;
 IF c.status='completed' OR c.max_members IS NULL OR c.max_members<1
  OR EXISTS(SELECT 1 FROM public.book_cohort_members WHERE cohort_id=c.id AND member_id=p_actor) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Book salon join unavailable';
 END IF;
 SELECT count(*) INTO n FROM public.book_cohort_members WHERE cohort_id=c.id;
 IF n>=c.max_members THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Book salon is full'; END IF;
 INSERT INTO public.book_cohort_members(cohort_id,member_id) VALUES(c.id,p_actor);
 RETURN jsonb_build_object('joined',true);
END $$;
CREATE FUNCTION public.soe_circle_legacy_salon_join(p_actor uuid,p_cohort_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT soe_circle_admission_private.legacy_salon_join(p_actor,p_cohort_id);
$$;
REVOKE ALL ON FUNCTION soe_circle_admission_private.legacy_salon_join(uuid,uuid),public.soe_circle_legacy_salon_join(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION soe_circle_admission_private.legacy_salon_join(uuid,uuid),public.soe_circle_legacy_salon_join(uuid,uuid) TO service_role;
COMMIT;
