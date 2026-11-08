BEGIN READ ONLY;
SET LOCAL statement_timeout = '5000ms';
WITH targets AS (
 SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('consented_match_projections','community_match_profiles','community_matches')
)
SELECT jsonb_build_object(
 'observed_at',clock_timestamp(),'server_version_num',current_setting('server_version_num'),'current_user',current_user,
 'tables',(SELECT jsonb_agg(jsonb_build_object(
   'name',t.relname,'kind',t.relkind,'owner',pg_get_userbyid(t.relowner),'rls',t.relrowsecurity,'force_rls',t.relforcerowsecurity,'partition',t.relispartition,'has_children',t.relhassubclass,
   'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
   'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN role=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role) END) FROM unnest(p.polroles) role),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))), '[]'::jsonb) FROM pg_policy p WHERE p.polrelid=t.oid),
   'role_privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'select',has_table_privilege(r.oid,t.oid,'SELECT'),'insert',has_table_privilege(r.oid,t.oid,'INSERT'),'update',has_table_privilege(r.oid,t.oid,'UPDATE'),'delete',has_table_privilege(r.oid,t.oid,'DELETE'),'truncate',has_table_privilege(r.oid,t.oid,'TRUNCATE'),'column_privilege',has_any_column_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')),
   'dependent_views',(SELECT coalesce(jsonb_agg(DISTINCT v.relname),'[]'::jsonb) FROM pg_depend d JOIN pg_rewrite rw ON rw.oid=d.objid JOIN pg_class v ON v.oid=rw.ev_class WHERE d.refobjid=t.oid AND v.oid<>t.oid),
   'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',tr.tgname,'enabled',tr.tgenabled,'function',tr.tgfoid::regprocedure::text,'definition_md5',md5(pg_get_functiondef(tr.tgfoid)))),'[]'::jsonb) FROM pg_trigger tr WHERE tr.tgrelid=t.oid AND NOT tr.tgisinternal)
 ) ORDER BY t.relname) FROM targets t),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'super',r.rolsuper,'bypass_rls',r.rolbypassrls,'create_role',r.rolcreaterole,'create_db',r.rolcreatedb,'replication',r.rolreplication,'can_create_public',has_schema_privilege(r.oid,'public','CREATE'),'can_use_public',has_schema_privilege(r.oid,'public','USAGE'),'memberships',(SELECT coalesce(jsonb_agg(pg_get_userbyid(m.roleid)),'[]'::jsonb) FROM pg_auth_members m WHERE m.member=r.oid))) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
) AS matching_catalog;
COMMIT;
