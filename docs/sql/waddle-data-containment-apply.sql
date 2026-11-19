-- Owner review draft. Stage on an isolated restore. The Storage bucket is
-- provider-managed and has a separate access and backup review.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE ONLY public.waddles IN ACCESS EXCLUSIVE MODE;

DO $containment$
DECLARE
  target constant regclass := 'public.waddles'::regclass;
BEGIN
  IF current_user <> 'postgres'
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated')
          AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolreplication) <> 2
    OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
               WHERE r.rolname IN ('anon','authenticated'))
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=target AND relkind='r' AND relowner=current_user::regrole
                   AND NOT relispartition AND NOT relforcerowsecurity)
    OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid=target OR inhparent=target)
    OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=target)
    OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname='public' AND tablename='waddles')
  THEN
    RAISE EXCEPTION 'Waddle roles, ownership or publication require review' USING ERRCODE='PT409';
  END IF;

  IF (SELECT array_agg(attname||':'||format_type(atttypid,atttypmod)||CASE WHEN attnotnull THEN '!' ELSE '' END
        ORDER BY attname COLLATE "C") FROM pg_attribute
        WHERE attrelid=target AND attnum>0 AND NOT attisdropped AND attidentity='' AND attgenerated=''
          AND attname<>'public_consent_at')
      IS DISTINCT FROM ARRAY[
        'audio_url:text','created_at:timestamp with time zone','id:uuid!','is_public:boolean','member_id:uuid',
        'nft_token_id:text','thinker_id:text','thinker_reaction:text','transcription:text']
    OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target AND attnum>0 AND NOT attisdropped
      AND (attidentity<>'' OR attgenerated<>''))
    OR (SELECT array_agg(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid=target OR confrelid=target)
      IS DISTINCT FROM ARRAY['PRIMARY KEY (id)']
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=target AND NOT tgisinternal)
    OR EXISTS (SELECT 1 FROM pg_rewrite rw WHERE rw.ev_class=target OR EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.classid='pg_rewrite'::regclass AND d.objid=rw.oid
        AND d.refclassid='pg_class'::regclass AND d.refobjid=target))
    OR EXISTS (
      SELECT 1 FROM pg_proc p CROSS JOIN pg_roles r WHERE p.prosecdef AND r.rolname IN ('anon','authenticated')
        AND has_schema_privilege(r.oid,p.pronamespace,'USAGE') AND has_function_privilege(r.oid,p.oid,'EXECUTE')
        AND (p.prosrc ~* '\mwaddles\M' OR EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass
          AND d.objid=p.oid AND d.refclassid='pg_class'::regclass AND d.refobjid=target))
    )
  THEN
    RAISE EXCEPTION 'Waddle schema or dependencies require review' USING ERRCODE='PT409';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target AND attname='public_consent_at' AND NOT attisdropped) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target AND attname='public_consent_at' AND NOT attisdropped
      AND atttypid='timestamptz'::regtype AND atttypmod=-1 AND NOT attnotnull AND NOT atthasdef
      AND col_description(attrelid,attnum)='soe:waddle-public-consent:v1') THEN
      RAISE EXCEPTION 'Waddle publication consent requires review' USING ERRCODE='PT409';
    END IF;
  ELSE
    ALTER TABLE public.waddles ADD COLUMN public_consent_at timestamptz;
    COMMENT ON COLUMN public.waddles.public_consent_at IS 'soe:waddle-public-consent:v1';
  END IF;

  REVOKE ALL PRIVILEGES ON TABLE public.waddles FROM PUBLIC,anon,authenticated RESTRICT;
  REVOKE ALL PRIVILEGES (audio_url,created_at,id,is_public,member_id,nft_token_id,thinker_id,thinker_reaction,transcription,public_consent_at)
    ON TABLE public.waddles FROM PUBLIC,anon,authenticated RESTRICT;
  ALTER TABLE public.waddles ENABLE ROW LEVEL SECURITY;

  IF EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')
    AND (has_table_privilege(r.oid,target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR has_any_column_privilege(r.oid,target,'SELECT,INSERT,UPDATE,REFERENCES')))
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS need(privilege)
      WHERE NOT has_table_privilege('service_role',target,need.privilege))
  THEN
    RAISE EXCEPTION 'Waddle effective grants require review' USING ERRCODE='PT409';
  END IF;
END
$containment$;

COMMIT;
