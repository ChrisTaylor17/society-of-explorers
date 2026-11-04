// UNKNOWN live reward bodies: these marked representative functions prove ACL behavior only.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
const ROOT=new URL('../../../../',import.meta.url);
export const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
export const SIGNATURES=['public.add_exp(uuid,integer,text)','public.increment_exp(uuid,integer)','public.increment_exp_tokens(uuid,integer)'];
const receipt=await readFile(new URL('../fixtures/legacy-rpc-catalog-2026-11-04.json',import.meta.url),'utf8');
export const CATALOG_SHA256='2ed02330357306c83abf5a862df59424679829399fd1a1c485e1db027ab546a6';
if(createHash('sha256').update(receipt).digest('hex')!==CATALOG_SHA256)throw Error('Reward catalog receipt changed');
export const CATALOG=JSON.parse(receipt).data;
export const FIXTURE_LIMITS=Object.freeze({
 rewardBodies:'UNKNOWN live bodies. Three marked representative bodies exercise ACL behavior only; MD5s intentionally differ from observed live digests.',
 attributes:'Observed names/types/owner/language/volatility/security/path/EXECUTE grants represented. Uncaptured attributes use synthetic PostgreSQL defaults.',
 prerequisites:'members, prompt tables, auth.uid and exp_events are minimal synthetic stubs. Exact canonical profile guard and prompt helper/policy/view slices run locally, not a full restore.',
 provider:'Actors/provider text/service transport are synthetic. No issued tokens, provider authentication, hosted PostgREST or multi-backend scheduling.',
});
export async function runRewardSql(db,name){
 if(!['preflight','apply','rollback'].includes(name))throw Error('Unexpected reward stage');
 try{return await db.exec(await readFile(new URL('docs/sql/reward-rpc-containment-'+name+'.sql',ROOT),'utf8'));}
 catch(e){await db.exec('ROLLBACK');throw e;}
}
export async function rewardDb(t){
 const db=new PGlite();await db.waitReady;t.after(()=>db.close());
 await db.exec('CREATE ROLE postgres NOLOGIN SUPERUSER;CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE unrelated_executor NOLOGIN;SET ROLE postgres;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role,unrelated_executor;');
 await db.exec('CREATE TABLE members(id uuid PRIMARY KEY,supabase_auth_id uuid,display_name text NOT NULL,bio text,discipline text,skills text[],project_description text,seeking text,philosophy text,exp_tokens integer,email text,tier text);ALTER TABLE members ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON members TO service_role;CREATE TABLE exp_events(id uuid DEFAULT gen_random_uuid(),member_id uuid,amount integer,reason text);GRANT INSERT,SELECT ON exp_events TO service_role;');
 await db.query("INSERT INTO members(id,supabase_auth_id,display_name,exp_tokens,email,tier) VALUES($1,$1,'Synthetic A',7,'PRIVATE_SYNTHETIC_EMAIL','protected'),($2,$2,'Synthetic B',3,NULL,'free')",[A,B]);
 await db.exec(await readFile(new URL('docs/sql/member-profile-apply.sql',ROOT),'utf8'));
 await db.exec([
 "CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;",
 "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
 "CREATE TABLE prompts(id uuid PRIMARY KEY,slug text,title text,description text,category text,usage_count bigint DEFAULT 0,created_by uuid,visibility text,published_at timestamptz);",
 "CREATE TABLE prompt_favorites(prompt_id uuid,member_id uuid);CREATE TABLE prompt_votes(prompt_id uuid,member_id uuid);",
 "CREATE TABLE prompt_entitlements(member_id uuid);CREATE TABLE prompt_runs(member_id uuid);",
 "GRANT SELECT ON prompts,prompt_favorites,prompt_votes,prompt_entitlements,prompt_runs TO anon,authenticated,service_role;",
 ].join('\n'));
 const atlas=await readFile(new URL('prompts-mvp/supabase/migrations/202606180001_prompt_atlas.sql',ROOT),'utf8');
 const helperStart=atlas.indexOf('create or replace function public.current_prompt_member_id()');
 const helperEnd=atlas.indexOf('-- Atomically reserves one run',helperStart),viewStart=atlas.indexOf('create or replace view public.prompt_community_leaderboard');
 if(helperStart<0||helperEnd<0||viewStart<0)throw Error('Reviewed canonical Prompt Atlas slices changed');
 await db.exec(atlas.slice(helperStart,helperEnd));await db.exec(atlas.slice(viewStart));
 await db.exec([
 "CREATE FUNCTION public.add_exp(p_member_id uuid,p_amount integer,p_reason text) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $representative$",
 "BEGIN",
 "-- REPRESENTATIVE_FIXTURE_ONLY_UNKNOWN_LIVE_REWARD_BODY",
 "UPDATE public.members SET exp_tokens=coalesce(exp_tokens,0)+p_amount WHERE id=p_member_id;",
 "END $representative$;",
 "CREATE FUNCTION public.increment_exp(member_id_input uuid,amount_input integer) RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER AS $representative$",
 "-- REPRESENTATIVE_FIXTURE_ONLY_UNKNOWN_LIVE_REWARD_BODY",
 "UPDATE public.members SET exp_tokens=coalesce(exp_tokens,0)+amount_input WHERE id=member_id_input;",
 "$representative$;",
 "CREATE FUNCTION public.increment_exp_tokens(member_id_input uuid,amount_input integer) RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER AS $representative$",
 "-- REPRESENTATIVE_FIXTURE_ONLY_UNKNOWN_LIVE_REWARD_BODY",
 "UPDATE public.members SET exp_tokens=coalesce(exp_tokens,0)+amount_input WHERE id=member_id_input;",
 "$representative$;",
 "GRANT EXECUTE ON FUNCTION public.add_exp(uuid,integer,text),public.increment_exp(uuid,integer),public.increment_exp_tokens(uuid,integer) TO PUBLIC,anon,authenticated,service_role,unrelated_executor;",
 "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role,unrelated_executor;",
 ].join('\n'));
 return db;
}
export async function asRole(db,role,fn){
 if(!['anon','authenticated','service_role','unrelated_executor'].includes(role))throw Error('Unexpected role');
 return db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);return fn(tx);});
}
export async function callReward(db,signature,params,role='service_role'){
 if(!SIGNATURES.includes(signature))throw Error('Unexpected reward signature');
 const name=signature.slice('public.'.length,signature.indexOf('('));
 return asRole(db,role,tx=>tx.query('SELECT public.'+name+'('+params.map((_,i)=>'$'+(i+1)).join(',')+')',params));
}
export async function rewardMetadata(db){
 return {
  functions:(await db.query("SELECT oid,proname,proowner,prolang,prokind,prosecdef,provolatile,proisstrict,proparallel,proconfig,md5(prosrc) body_md5,proargnames,proargtypes::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('add_exp','increment_exp','increment_exp_tokens') ORDER BY oid")).rows,
  acl:(await db.query("SELECT p.oid,a.grantor,a.grantee,a.privilege_type,a.is_grantable FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace='public'::regnamespace AND p.proname IN('add_exp','increment_exp','increment_exp_tokens') ORDER BY p.oid,a.grantor,a.grantee,a.privilege_type,a.is_grantable")).rows,
  helper:(await db.query("SELECT oid,proowner,prosecdef,provolatile,proconfig,proacl::text,md5(prosrc) body_md5 FROM pg_proc WHERE oid='public.current_prompt_member_id()'::regprocedure")).rows,
  policies:(await db.query("SELECT oid,polrelid,polname,polcmd,polpermissive,polroles::text,polqual::text,polwithcheck::text FROM pg_policy ORDER BY oid")).rows,
  leaderboard:(await db.query("SELECT oid,relacl::text,reloptions,pg_get_viewdef(oid) definition FROM pg_class WHERE oid='public.prompt_community_leaderboard'::regclass")).rows,
  tableACL:(await db.query("SELECT relname,relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname<>'soe_reward_rpc_containment_v1_state' ORDER BY relname")).rows,
  defaults:(await db.query('SELECT oid,defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY oid')).rows,
  members:(await db.query('SELECT * FROM members ORDER BY id')).rows,events:(await db.query('SELECT * FROM exp_events ORDER BY id')).rows,
 };
}
