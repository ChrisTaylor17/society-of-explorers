-- Owner-reviewed SQL candidate, not a hosted migration. Rehearse after the
-- deletion-request and erasure-access drafts on an isolated database.
-- Adds receipt projection only: no processing start, erasure or completion.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regclass('soe_account_deletion_private.processing') IS NULL
    OR to_regprocedure('soe_account_deletion_private.owner_state(text,uuid)') IS NULL
    OR to_regprocedure('soe_account_deletion_private.submit_request(text,uuid,uuid,text,integer)') IS NULL
    OR to_regprocedure('soe_account_deletion_private.receipt_status(uuid,text)') IS NULL
    OR to_regprocedure('soe_account_deletion_private.start_erasure(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Install and verify the existing deletion request and processing drafts first';
  END IF;
END $$;

-- Existing routines perform owner or hashed-code authorization. Only the
-- already-authorized receipt is joined with the private processing timestamp.
CREATE FUNCTION soe_account_deletion_private.owner_progress(p_provider text, p_subject uuid)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz, "processingStartedAt" timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT receipt.id, receipt."requestedAt", receipt."reviewBy", processing.started_at
  FROM soe_account_deletion_private.owner_state(p_provider,p_subject) AS receipt
  LEFT JOIN soe_account_deletion_private.processing AS processing ON processing.request_id=receipt.id;
$$;

CREATE FUNCTION soe_account_deletion_private.request_progress(
  p_provider text,p_subject uuid,p_request_id uuid,p_receipt_hash text,p_review_days integer
)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz, "processingStartedAt" timestamptz)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT receipt.id, receipt."requestedAt", receipt."reviewBy", processing.started_at
  FROM soe_account_deletion_private.submit_request(p_provider,p_subject,p_request_id,p_receipt_hash,p_review_days) AS receipt
  LEFT JOIN soe_account_deletion_private.processing AS processing ON processing.request_id=receipt.id;
$$;

CREATE FUNCTION soe_account_deletion_private.status_progress(p_request_id uuid,p_receipt_hash text)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz, "processingStartedAt" timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT receipt.id, receipt."requestedAt", receipt."reviewBy", processing.started_at
  FROM soe_account_deletion_private.receipt_status(p_request_id,p_receipt_hash) AS receipt
  LEFT JOIN soe_account_deletion_private.processing AS processing ON processing.request_id=receipt.id;
$$;

CREATE FUNCTION public.soe_account_deletion_owner_progress(p_provider text,p_subject uuid)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz, "processingStartedAt" timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT * FROM soe_account_deletion_private.owner_progress(p_provider,p_subject);
$$;
CREATE FUNCTION public.soe_account_deletion_request_progress(
  p_provider text,p_subject uuid,p_request_id uuid,p_receipt_hash text,p_review_days integer
)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz, "processingStartedAt" timestamptz)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT * FROM soe_account_deletion_private.request_progress(p_provider,p_subject,p_request_id,p_receipt_hash,p_review_days);
$$;
CREATE FUNCTION public.soe_account_deletion_status_progress(p_request_id uuid,p_receipt_hash text)
RETURNS TABLE (id uuid, "requestedAt" timestamptz, "reviewBy" timestamptz, "processingStartedAt" timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT * FROM soe_account_deletion_private.status_progress(p_request_id,p_receipt_hash);
$$;

REVOKE ALL ON FUNCTION
  public.soe_account_deletion_owner_progress(text,uuid),
  public.soe_account_deletion_request_progress(text,uuid,uuid,text,integer),
  public.soe_account_deletion_status_progress(uuid,text),
  soe_account_deletion_private.owner_progress(text,uuid),
  soe_account_deletion_private.request_progress(text,uuid,uuid,text,integer),
  soe_account_deletion_private.status_progress(uuid,text)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.soe_account_deletion_owner_progress(text,uuid),
  public.soe_account_deletion_request_progress(text,uuid,uuid,text,integer),
  public.soe_account_deletion_status_progress(uuid,text),
  soe_account_deletion_private.owner_progress(text,uuid),
  soe_account_deletion_private.request_progress(text,uuid,uuid,text,integer),
  soe_account_deletion_private.status_progress(uuid,text)
TO service_role;

DO $$
DECLARE signature text; browser text;
BEGIN
  IF pg_has_role('service_role',current_user,'MEMBER')
    OR has_schema_privilege('service_role','soe_account_deletion_private','CREATE')
    OR has_table_privilege('service_role','soe_account_deletion_private.requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege('service_role','soe_account_deletion_private.requests','SELECT,INSERT,UPDATE')
    OR has_table_privilege('service_role','soe_account_deletion_private.processing','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege('service_role','soe_account_deletion_private.processing','SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'Unexpected effective deletion progress privileges';
  END IF;
  FOREACH browser IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF pg_has_role(browser,'service_role','MEMBER') OR pg_has_role(browser,current_user,'MEMBER')
      OR has_schema_privilege(browser,'soe_account_deletion_private','USAGE,CREATE')
      OR has_table_privilege(browser,'soe_account_deletion_private.requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(browser,'soe_account_deletion_private.requests','SELECT,INSERT,UPDATE')
      OR has_table_privilege(browser,'soe_account_deletion_private.processing','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(browser,'soe_account_deletion_private.processing','SELECT,INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Unexpected effective browser deletion progress privileges';
    END IF;
    FOREACH signature IN ARRAY ARRAY[
      'public.soe_account_deletion_owner_progress(text,uuid)',
      'public.soe_account_deletion_request_progress(text,uuid,uuid,text,integer)',
      'public.soe_account_deletion_status_progress(uuid,text)',
      'soe_account_deletion_private.owner_progress(text,uuid)',
      'soe_account_deletion_private.request_progress(text,uuid,uuid,text,integer)',
      'soe_account_deletion_private.status_progress(uuid,text)'
    ] LOOP
      IF has_function_privilege(browser,signature,'EXECUTE') THEN
        RAISE EXCEPTION 'Browser role can invoke a private deletion progress routine';
      END IF;
    END LOOP;
  END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
