-- Owner draft. Apply after the passage-post routines and before adding more
-- editions. Keep the Gutenberg passage validator separate from study discussion.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_proc p
   WHERE p.oid=to_regprocedure('public._soe_circle_passage_reference_valid(jsonb)')
     AND p.proowner=current_user::regrole AND NOT p.prosecdef AND p.provolatile='i'
     AND p.prorettype='pg_catalog.bool'::regtype AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
     AND p.proconfig=ARRAY['search_path=pg_catalog, public']
     AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IN (
       'aab74b590f070ce7c6e3e44cd92156c57d28bdac66fe23f6bcfcfbf54cc6e796',
       '20daaf0d65d81758cb3472404b2440a0cde18efba21e64e9084972aceae835fd'
     )
     AND has_function_privilege('service_role',p.oid,'EXECUTE')
     AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
     AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 ) THEN
   RAISE EXCEPTION 'Review the installed passage reference validator first' USING ERRCODE='PT409';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public._soe_circle_passage_reference_valid(p_reference jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE blocks integer; block_index numeric; first_offset numeric; last_offset numeric;
BEGIN
 IF p_reference IS NULL OR jsonb_typeof(p_reference) IS DISTINCT FROM 'object' OR octet_length(p_reference::text)>2048 THEN RETURN false; END IF;
 IF NOT(p_reference ?& ARRAY['version','bookId','editionId','blockIndex','start','end'])
  OR p_reference-ARRAY['version','bookId','editionId','blockIndex','start','end']<>'{}'::jsonb
  OR p_reference->'version' IS DISTINCT FROM '1'::jsonb
  OR jsonb_typeof(p_reference->'bookId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_reference->'editionId') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_reference->'blockIndex') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
 SELECT e.block_count INTO blocks FROM public._soe_circle_reading_editions() e
  -- Only indexed Gutenberg editions have canonical source blocks and quote offsets.
 WHERE e.book_id=p_reference->>'bookId' AND e.edition_id=p_reference->>'editionId' AND e.edition_id LIKE 'pg-%';
 IF NOT FOUND THEN RETURN false; END IF;
 block_index:=(p_reference->>'blockIndex')::numeric;
 IF block_index<>trunc(block_index) OR block_index<0 OR block_index>=blocks THEN RETURN false; END IF;
 IF p_reference->'start'='null'::jsonb AND p_reference->'end'='null'::jsonb THEN RETURN true; END IF;
 IF jsonb_typeof(p_reference->'start') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_reference->'end') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
 first_offset:=(p_reference->>'start')::numeric; last_offset:=(p_reference->>'end')::numeric;
 RETURN first_offset=trunc(first_offset) AND last_offset=trunc(last_offset)
  AND first_offset>=0 AND last_offset>first_offset AND last_offset<=9007199254740991
  AND last_offset-first_offset<=600;
END $$;
COMMIT;
