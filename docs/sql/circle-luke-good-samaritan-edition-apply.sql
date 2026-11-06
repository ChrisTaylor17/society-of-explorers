-- Unapplied owner-reviewed addition. Stage after the existing reading program
-- draft and verify the pinned passage and restore before opening this listing.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid=to_regprocedure('public._soe_circle_reading_editions()')
      AND p.proowner=current_user::regrole AND NOT p.prosecdef AND p.provolatile='i'
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='sql')
      AND p.proconfig=ARRAY['search_path=pg_catalog, public']
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IN (
        '2e68d41fb3227fd92215a203bfe859bd7870f493a454ea456fea228bc08de468',
        '9c55c1db4449dffa8f8e751c78a137c6752cedea4dea7c8bf7b3a04f48043a6f'
      )
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Review the installed reading edition catalog first' USING ERRCODE='PT409';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._soe_circle_reading_editions() RETURNS TABLE(book_id text,edition_id text,block_count integer)
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 VALUES
  ('apology','pg-1656-c23a532ff45b46926abb91c193151af3f4aa8d27dc3bb76a3bb8971a427642c7',125),
  ('divine-comedy','pg-8800-e77de137b64fe83297c694a797430e09510f31591e099272edd1d49bdc9b94bb',440),
  ('genealogy-of-morals','pg-52319-50880f01d2e0afb107d49cb939f69086d3c1e6fccd2aad4ee68c329a1091e50c',347),
  ('hamlet','pg-1524-6bcc78cc0b21d3130b1a267990dd41b78f17785eeb089da3c5c9aa4eaac82825',1446),
  ('luke-good-samaritan','web-classic-08e329a5fdbf1c3516a4b59ca8add43b81c05b74e3807bb1c9211c269ba7507f',1),
  ('meditations','pg-2680-299ccec053a7da0dc33b3f1e32812fc1f33852ab962390f7680d925f015624d1',1186),
  ('odyssey','pg-1727-9328957b68516333c6c2f5618e8680f738c3f847756b777a94a5469231a9e569',1357),
  ('philemon','web-classic-b2bc6316f4217a8c97637d44786a4cd6b9b9a83b88cd4880b5aacdf67cae4e19',1),
  ('relativity','pg-5001-14298e92fba1f6f40331a878b6fda08a79cd348e928388f7f27f61b37243981c',550),
  ('republic','pg-1497-c0bf2b223089459d9868aaeb69f295b307734ec9c232a9dabc8c1f9b496dcfb4',4747);
$$;
COMMIT;
