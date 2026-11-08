-- READ ONLY. Review after admission cutover and before the unapplied candidate.
SELECT to_regnamespace('soe_book_salons_private') IS NULL AS new_schema_available,
 to_regprocedure('public.soe_circle_legacy_salon_create(uuid,uuid,jsonb)') IS NULL AS new_rpc_available,
 to_regprocedure('soe_circle_admission_private.require_actor(uuid)') IS NOT NULL AS actor_gate_present,
 to_regprocedure('public._soe_circle_participation_actor(uuid)') IS NOT NULL AS actor_serialization_present,
 to_regclass('soe_account_deletion_private.identity_gate') IS NOT NULL AS identity_gate_present,
 to_regclass('soe_account_deletion_private.processing') IS NOT NULL AS erasure_guard_present,
 NOT has_any_column_privilege('service_role','public.book_cohort_members','INSERT') AS raw_membership_closed;
SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.oid IN(to_regprocedure('soe_circle_admission_private.require_actor(uuid)'),
 to_regprocedure('public._soe_circle_participation_actor(uuid)'));
