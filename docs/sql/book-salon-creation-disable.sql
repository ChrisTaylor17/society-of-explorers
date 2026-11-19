-- REVIEWED ROLLBACK CANDIDATE, NOT AUTOMATIC. Disable creation before rolling
-- application code back. Preserve salons, memberships and retry receipts.
-- Never restore the old raw-writer route while raw membership grants are closed.
BEGIN;
REVOKE ALL ON FUNCTION public.soe_circle_legacy_salon_create(uuid,uuid,jsonb),
 soe_book_salons_private.create_salon(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
