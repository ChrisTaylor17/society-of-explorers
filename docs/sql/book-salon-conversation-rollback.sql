-- UNAPPLIED LOCAL CANDIDATE. Requires separate operational authorization.
-- Removes only these four reviewed functions, atomically with RESTRICT. Posts,
-- profiles, sender fields, containment and the Circle chain remain in place.
-- Coordinate trusted-owner maintenance; this is not a release-wide rollback.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
DO $guard$
BEGIN
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
   AND p.proname IN('_soe_book_salon_plain','_soe_book_salon_name','soe_book_salon_messages_read','soe_book_salon_messages_post'))<>4
  OR EXISTS(SELECT 1 FROM (VALUES
    ('public._soe_book_salon_plain(text,integer,boolean)','09b81d78ff3b2362597fdf7974185a28','boolean','i',ARRAY['p_value','p_limit','p_single']::text[],'sql'),
    ('public._soe_book_salon_name(text)','11de0d4267dbeb6f36a3fd7eb51bf3c5','text','i',ARRAY['p_value']::text[],'sql'),
    ('public.soe_book_salon_messages_read(uuid,uuid)','eab870759f60dd6e4f184b782609cab5','jsonb','v',ARRAY['p_actor','p_cohort_id']::text[],'plpgsql'),
    ('public.soe_book_salon_messages_post(uuid,uuid,text,text)','238c184005675a04689e23b61ff36010','jsonb','v',ARRAY['p_actor','p_cohort_id','p_content','p_member_name']::text[],'plpgsql')
   ) expected(signature,source_md5,result_type,volatility,arg_names,language)
   LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
   WHERE p.oid IS NULL OR pg_get_userbyid(p.proowner)<>current_user OR md5(p.prosrc)<>expected.source_md5
    OR p.prorettype<>to_regtype(expected.result_type) OR p.provolatile::text<>expected.volatility
    OR p.proargnames IS DISTINCT FROM expected.arg_names OR p.proargmodes IS NOT NULL
    OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname=expected.language)
    OR p.prokind<>'f' OR p.proretset OR p.prosecdef OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
    OR p.provariadic<>0 OR p.pronargdefaults<>0 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
    OR obj_description(p.oid,'pg_proc') IS DISTINCT FROM 'soe-book-salon-conversation:v1:owned'
    OR NOT has_function_privilege('service_role',p.oid,'EXECUTE')
    OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee<>p.proowner AND NOT(a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role')
        AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Salon function ownership, definition, signature or access drift requires review';
 END IF;
END $guard$;
DROP FUNCTION public.soe_book_salon_messages_read(uuid,uuid),public.soe_book_salon_messages_post(uuid,uuid,text,text) RESTRICT;
DROP FUNCTION public._soe_book_salon_name(text) RESTRICT;
DROP FUNCTION public._soe_book_salon_plain(text,integer,boolean) RESTRICT;
COMMIT;
