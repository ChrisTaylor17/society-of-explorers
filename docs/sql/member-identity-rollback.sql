-- REVIEWED LOCAL DRAFT ONLY. Never applied to a hosted/production database here.
-- Requires separately approved restore/preflight and explicit owner execution.
-- No account merges, deletes, backfills, profile output, RLS/grant changes or RPCs.
-- Assumptions are checked, not inferred from incomplete recovered members DDL.
-- Rollback only the semantically unchanged, unowned-by-constraint draft index
-- carrying this draft's ownership marker. Existing constraints/indexes survive.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
LOCK TABLE public.members IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE
  named_oid oid := to_regclass('public.soe_members_auth_subject_key');
  auth_att smallint;
BEGIN
  IF named_oid IS NULL THEN RETURN; END IF;
  IF obj_description(named_oid,'pg_class') IS DISTINCT FROM 'soe-member-identity:v1:created-by-reviewed-draft' THEN RETURN; END IF;
  SELECT attnum INTO auth_att FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='supabase_auth_id' AND NOT attisdropped;
  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=named_oid AND i.indrelid='public.members'::regclass AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
    AND i.indnkeyatts=1 AND i.indkey[0]=auth_att AND i.indexprs IS NULL AND NOT i.indnullsnotdistinct
    AND (i.indpred IS NULL OR pg_get_expr(i.indpred,i.indrelid)='(supabase_auth_id IS NOT NULL)')
    AND i.indclass[0]=(SELECT op.oid FROM pg_opclass op JOIN pg_am am ON am.oid=op.opcmethod WHERE op.opcnamespace='pg_catalog'::regnamespace AND op.opcname='uuid_ops' AND am.amname='btree')) OR EXISTS (SELECT 1 FROM pg_constraint WHERE conindid=named_oid) THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Member identity rollback ownership requires review.';
  END IF;
  DROP INDEX public.soe_members_auth_subject_key;
END
$rollback$;
COMMIT;
