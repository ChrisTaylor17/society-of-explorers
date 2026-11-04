-- REVIEWED LOCAL DRAFT ONLY. Never applied to a hosted/production database here.
-- Requires separately approved restore/preflight and explicit owner execution.
-- No account merges, deletes, backfills, profile output, RLS/grant changes or RPCs.
-- Assumptions are checked, not inferred from incomplete recovered members DDL.
-- A regular index build deliberately blocks writes under a short lock deadline.
-- Schedule separately after actual size/load review; no concurrent-build claim.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
LOCK TABLE public.members IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
DECLARE
  members_oid oid := to_regclass('public.members');
  auth_att smallint;
  id_att smallint;
  table_owner oid;
BEGIN
  IF members_oid IS NULL OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=members_oid AND relkind='r' AND NOT relispartition) THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Member identity schema requires review.';
  END IF;
  SELECT relowner INTO table_owner FROM pg_class WHERE oid=members_oid;
  IF current_user::regrole::oid <> table_owner AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Member identity preflight requires the table owner.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.rolname=current_user WHERE c.oid=members_oid AND c.relforcerowsecurity AND NOT r.rolsuper AND NOT r.rolbypassrls) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Member identity preflight requires an unfiltered owner view.';
  END IF;
  SELECT attnum INTO auth_att FROM pg_attribute WHERE attrelid=members_oid AND attname='supabase_auth_id' AND atttypid='uuid'::regtype AND NOT attnotnull AND NOT attisdropped;
  SELECT attnum INTO id_att FROM pg_attribute WHERE attrelid=members_oid AND attname='id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped;
  IF auth_att IS NULL OR id_att IS NULL OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=members_oid AND contype='p' AND conkey=ARRAY[id_att]::smallint[]) THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Member identity column assumptions require review.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.members WHERE supabase_auth_id IS NOT NULL GROUP BY supabase_auth_id HAVING count(*)>1) THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Duplicate member identities require an explicit ownership review.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_index WHERE indrelid=members_oid AND indisunique AND indnkeyatts=1 AND indkey[0]=auth_att AND indnullsnotdistinct) THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Member identity NULL semantics require review.';
  END IF;
END
$preflight$;
DO $identity$
DECLARE
  auth_att smallint;
  named_oid oid := to_regclass('public.soe_members_auth_subject_key');
BEGIN
  SELECT attnum INTO auth_att FROM pg_attribute WHERE attrelid='public.members'::regclass AND attname='supabase_auth_id' AND NOT attisdropped;
  IF named_oid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=named_oid AND i.indrelid='public.members'::regclass AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
    AND i.indnkeyatts=1 AND i.indkey[0]=auth_att AND i.indexprs IS NULL AND NOT i.indnullsnotdistinct
    AND (i.indpred IS NULL OR pg_get_expr(i.indpred,i.indrelid)='(supabase_auth_id IS NOT NULL)')
    AND i.indclass[0]=(SELECT op.oid FROM pg_opclass op JOIN pg_am am ON am.oid=op.opcmethod WHERE op.opcnamespace='pg_catalog'::regnamespace AND op.opcname='uuid_ops' AND am.amname='btree')) THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Member identity index name collision requires review.';
  END IF;
  -- Preserve any existing equivalent constraint/index, including its ownership
  -- and comment. A different name is not a reason to create another index.
  IF EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid='public.members'::regclass AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
    AND i.indnkeyatts=1 AND i.indkey[0]=auth_att AND i.indexprs IS NULL AND NOT i.indnullsnotdistinct
    AND (i.indpred IS NULL OR pg_get_expr(i.indpred,i.indrelid)='(supabase_auth_id IS NOT NULL)')
    AND i.indclass[0]=(SELECT op.oid FROM pg_opclass op JOIN pg_am am ON am.oid=op.opcmethod WHERE op.opcnamespace='pg_catalog'::regnamespace AND op.opcname='uuid_ops' AND am.amname='btree')) THEN RETURN; END IF;
  CREATE UNIQUE INDEX soe_members_auth_subject_key ON public.members USING btree (supabase_auth_id);
  COMMENT ON INDEX public.soe_members_auth_subject_key IS 'soe-member-identity:v1:created-by-reviewed-draft';
END
$identity$;
COMMIT;
