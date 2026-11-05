-- Disable the salon pilot before removing its transient check-in store.
BEGIN;
SET LOCAL lock_timeout = '2s';
DROP FUNCTION public.soe_circle_salon_presence(uuid, uuid, uuid, text);
DROP TABLE public.circle_salon_presence;
COMMIT;
