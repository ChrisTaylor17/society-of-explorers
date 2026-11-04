// Exact captured reward bodies; all member/event rows and provider/auth transport are synthetic.
import assert from 'node:assert/strict';
import {lstat,stat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '../../tooling/node_modules/@electric-sql/pglite/dist/index.js';
const ROOT=new URL('../../../../',import.meta.url);
export const FIXTURE='verification/web/tests/fixtures/reward-live-bodies-2026-11-04.json';
export const CATALOG_FIXTURE='verification/web/tests/fixtures/legacy-rpc-catalog-2026-11-04.json';
export const FIXTURE_SHA256='e8a8a02d150e120adca9ccab34b0994564a4beb217cf36ab392ce832405211a0';
export async function materializedRewardSource(name){
 const file=new URL(name,ROOT),link=await lstat(file),info=await stat(file);
 assert.equal(link.isSymbolicLink(),false,'Refuse reward source symlink '+name);
 assert.ok(!info.size||info.blocks,'Refuse reward source placeholder '+name);return readFile(file);
}
const bytes=await materializedRewardSource(FIXTURE);
assert.equal(createHash('sha256').update(bytes).digest('hex'),FIXTURE_SHA256,'Review changed exact live definition receipt');
export const LIVE_BODIES=JSON.parse(bytes).functions;
export const LIVE_CATALOG=JSON.parse(await materializedRewardSource(CATALOG_FIXTURE)).data;
export const SQL_FILES=['preflight','apply','rollback'].map(stage=>'docs/sql/reward-rpc-containment-'+stage+'.sql');
const SOURCES=[FIXTURE,CATALOG_FIXTURE,...SQL_FILES,'docs/sql/member-profile-apply.sql','app/api/thinker/route.ts','verification/web/tests/support/offline-app.mjs','tests/security/fakes.ts','lib/http/routeError.ts','verification/web/tests/support/reward-live-body-db.mjs','verification/web/tests/reward-live-body-db.test.mjs'];
export const REWARD_LIVE_SOURCE_HASHES=Object.freeze(Object.fromEntries(await Promise.all(SOURCES.map(async name=>[name,createHash('sha256').update(await materializedRewardSource(name)).digest('hex')]))));
await materializedRewardSource('verification/web/tests/support/offline-app.mjs');
const {offlineApp}=await import('./offline-app.mjs');
export const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
export const AUTH_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SIGNATURES=Object.freeze(LIVE_BODIES.map(f=>'public.'+f.signature));
export const REWARD_LIVE_LIMITS=Object.freeze({
 definitions:'Exact captured CREATE definitions, body bytes/MD5 and observed attributes checked against the earlier live catalog. No live invocation or user-row copy.',
 schema:'Observed members.exp_tokens integer nullable/default10 and exp_events columns/PK/FK/RLS/owners. Other members profile columns and seeded identities are explicitly synthetic; not a full restore.',
 foreignKey:'Observed exp_events.member_id -> members.id; uncaptured FK name/actions use explicit synthetic name and PostgreSQL NO ACTION defaults.',
 profile:'Actual local planned profile migration adds its trigger/columns; live metadata had no user triggers. Guarded and unguarded fixtures are separate options.',
 tableAccess:'Browser raw table grants/policies are deliberately absent to isolate SECURITY DEFINER exposure even with closed raw tables; no claim about exact deployed table ACL/policy execution.',
 defaults:'Synthetic broad default grants stress only receipt ACL scrub; no global production defaults change.',
 transport:'Actual Thinker module, synthetic verified-member identity/provider stream and controlled service transport to PGlite. No issued credential, real provider, account, hosted PostgREST or multi-backend proof.',
});
export async function createRewardLiveDb({profileGuard=true}={}){
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec(`CREATE ROLE postgres NOLOGIN SUPERUSER;CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
   SET ROLE postgres;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
   CREATE TABLE members(id uuid PRIMARY KEY,supabase_auth_id uuid,display_name text,bio text,discipline text,skills text[],project_description text,seeking text,philosophy text,email text,tier text,exp_tokens integer DEFAULT 10);
   ALTER TABLE members ENABLE ROW LEVEL SECURITY;
   CREATE TABLE exp_events(id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,created_at timestamptz DEFAULT now(),member_id uuid REFERENCES members(id),amount integer NOT NULL,reason text);
   ALTER TABLE exp_events ENABLE ROW LEVEL SECURITY;
   GRANT SELECT,INSERT,UPDATE,DELETE ON members,exp_events TO service_role;`);
  await db.query("INSERT INTO members(id,supabase_auth_id,display_name,bio,skills,exp_tokens,email,tier) VALUES($1,$3,'Synthetic A','Private fixture profile',ARRAY['Reading'],7,'PRIVATE_SYNTHETIC_EMAIL','protected'),($2,$4,'Synthetic B','Unrelated fixture profile',ARRAY['Writing'],3,NULL,'free')",[A,B,AUTH_A,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
  if(profileGuard)await db.exec((await materializedRewardSource('docs/sql/member-profile-apply.sql')).toString('utf8'));
  for(const f of LIVE_BODIES)await db.exec(f.definition);
  await db.exec('GRANT EXECUTE ON FUNCTION public.add_exp(uuid,integer,text),public.increment_exp(uuid,integer),public.increment_exp_tokens(uuid,integer) TO PUBLIC,anon,authenticated,service_role;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;');
  return db;
 }catch(error){await db.close();throw error;}
}
export async function asRole(db,role,work){
 assert.ok(['anon','authenticated','service_role'].includes(role));
 return db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);return work(tx);});
}
export async function callReward(db,name,args,role='service_role'){
 assert.ok(['add_exp','increment_exp','increment_exp_tokens'].includes(name));
 return asRole(db,role,tx=>tx.query('SELECT public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args));
}
export async function runRewardSql(db,stage){
 assert.ok(['preflight','apply','rollback'].includes(stage));
 try{return await db.exec((await materializedRewardSource('docs/sql/reward-rpc-containment-'+stage+'.sql')).toString('utf8'));}catch(error){await db.exec('ROLLBACK');throw error;}
}
export async function liveRewardMetadata(db){
 return (await db.query(`SELECT p.oid,p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,l.lanname language,p.prosecdef security_definer,p.provolatile volatility,p.proconfig settings,md5(p.prosrc) body_md5,octet_length(p.prosrc) body_bytes,length(p.prosrc) body_characters,p.pronargdefaults default_count,pg_get_expr(p.proargdefaults,0) default_expression,p.proisstrict strict,p.proretset setof,p.prokind kind,p.proargnames arg_names
 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace='public'::regnamespace AND p.proname IN('add_exp','increment_exp','increment_exp_tokens') ORDER BY p.proname`)).rows;
}
export async function rewardRows(db){return{members:(await db.query('SELECT * FROM members ORDER BY id')).rows,events:(await db.query('SELECT * FROM exp_events ORDER BY created_at,id')).rows};}
export async function thinkerFixture(db,{actor=A}={}){
 // The existing loader stats every application source before reading it. All
 // providers are mocked before loading the actual route; its fallback fetch denies.
 const app=offlineApp(),stats={providerCalls:0,rpcCalls:[],eventInserts:0,fallbacks:0,authCalls:0};const noop=async()=>undefined;
 app.setMock('@/lib/ai/anthropic',()=>({createAnthropicClient:()=>({messages:{stream:()=>{stats.providerCalls++;return{on:(kind,callback)=>{if(kind==='text')callback('Synthetic exact-body offline reply.');},finalMessage:async()=>({usage:{}})};}}}),resolveClaudeModel:()=> 'SYNTHETIC_MODEL',logClaudeUsage:()=>{}}));
 app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>{stats.authCalls++;return actor?{memberId:actor,member:(await db.query('SELECT * FROM members WHERE id=$1',[actor])).rows[0],auth:{provider:'supabase',subject:AUTH_A}}:null;}}));
 app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>({from(table){if(table==='exp_events')return{insert:async row=>{stats.eventInserts++;await asRole(db,'service_role',tx=>tx.query('INSERT INTO exp_events(member_id,amount,reason) VALUES($1,$2,$3)',[row.member_id,row.amount,row.reason]));return{error:null};}};stats.fallbacks++;throw Error('Unexpected service fallback');},rpc:async(name,params)=>{stats.rpcCalls.push({name,params:{...params}});await callReward(db,name,[params.member_id_input,params.amount_input]);return{error:null};}})}));
 app.setMock('@/lib/claude/thinkers',()=>({buildSystemPrompt:()=> 'Synthetic system'}));
 app.setMock('@/lib/thinkerMemory',()=>({getMemory:async()=>null,recordInteraction:noop}));app.setMock('@/lib/thinkerActions',()=>({parseActions:text=>({actions:[],cleanText:text})}));
 app.setMock('@/lib/actions/executeActions',()=>({executeActionsWithResults:async()=>[]}));app.setMock('@/lib/rateLimit',()=>({limitModelCall:()=>null}));
 app.setMock('@/lib/salons/access',()=>({memberCanUseSharedSalon:async()=>false}));app.setMock('@/lib/memory/embeddings',()=>({storeConversationEmbedding:noop}));
 app.setMock('@/lib/memory/sharedMemory',()=>({getThinkerContext:async()=>null,storeEpisode:noop,extractMemory:noop}));app.setMock('@/lib/community/getCommunity',()=>({getCommunityThinkerPrompts:async()=>({})}));app.setMock('@/lib/governance/hats',()=>({checkPermission:async()=>true}));
 const route=app.load('app/api/thinker/route.ts');return{stats,post:body=>route.POST(new Request('https://soe.invalid/api/thinker',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}))};
}
