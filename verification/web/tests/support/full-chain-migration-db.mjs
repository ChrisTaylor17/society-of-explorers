// One bounded synthetic pre-state, one database for the complete ordered chain.
// This is not a full production restore or a hosted/multi-backend acceptance test.
import assert from 'node:assert/strict';
import {lstat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
const ROOT=new URL('../../../../',import.meta.url);
export const evidence={databasesCreated:0,databasesClosed:0,providerCalls:0,sources:{},executions:[],omittedStages:[],observations:[]};
export async function source(path){
 const file=new URL(path,ROOT),s=await lstat(file);
 assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Refuse nonresident/nonregular source '+path);
 const bytes=await readFile(file),hash=createHash('sha256').update(bytes).digest('hex');
 if(evidence.sources[path])assert.equal(hash,evidence.sources[path],'Source changed during rehearsal '+path);
 evidence.sources[path]=hash;return bytes.toString();
}
// Bind the cached engine's static local module closure and the two data leaves
// before importing it; no directory/dependency tree walk or acquisition.
export const RUNTIME_PREFIX='verification/web/tooling/node_modules/@electric-sql/pglite/';
const runtimeSeen=new Set();
async function bindRuntime(path){
 if(runtimeSeen.has(path))return;
 assert(path.startsWith(RUNTIME_PREFIX)&&runtimeSeen.size<64,'Unexpected cached runtime closure');runtimeSeen.add(path);
 const text=await source(path);
 if(!path.endsWith('.js'))return;
 for(const match of text.matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.\.?\/[^"']+\.js)["']/g))await bindRuntime(posix.normalize(posix.join(posix.dirname(path),match[1])));
}
assert.equal(JSON.parse(await source(RUNTIME_PREFIX+'package.json')).version,'0.4.1');
await bindRuntime(RUNTIME_PREFIX+'dist/index.js');
for(const leaf of ['dist/pglite.wasm','dist/pglite.data'])await source(RUNTIME_PREFIX+leaf);
await source('verification/web/scripts/deny-build-network.cjs');
export const CATALOG_PROJECTION_PATH='verification/web/tests/fixtures/full-chain-catalog-projection-2026-11-04.json';
const CATALOG_PROJECTION=JSON.parse(await source(CATALOG_PROJECTION_PATH));
assert.equal(evidence.sources[CATALOG_PROJECTION_PATH],'4e7c5e1fe7e8ffe85656b780ba9aae7201d7af26a3da6310fedb129271186a16');
for(const file of ['verification/web/tests/support/circle-live-db.mjs','verification/web/tests/fixtures/circle-live-catalog-2026-11-04.json'])await source(file);
const live=await import('./circle-live-db.mjs');
export const {IDS,requestId,asRole,snapshotLegacyRows}=live;
const pair=name=>['preflight','apply'].map(action=>`docs/sql/${name}-${action}.sql`);
export const ORDERED_STAGES=Object.freeze([
 {stage:'recognized-reading-policy-baseline',files:['docs/sql/great-books-private-data.sql']},
 {stage:'core-containment',files:pair('first-release-core-containment')},
 {stage:'identity',files:['docs/sql/member-identity-preflight.sql','docs/sql/member-identity-unique.sql']},
 {stage:'profile',files:pair('member-profile')},
 {stage:'strict-circle-baseline',files:pair('circle-legacy-baseline')},
 {stage:'current-circle-workflows',files:[...live.CIRCLE_SQL_CHAIN]},
 {stage:'ordinary-salon',files:['docs/sql/book-salon-conversation.sql']},
 {stage:'artifact-containment',files:pair('artifact-containment')},
 {stage:'reward-containment',files:pair('reward-rpc-containment')},
 {stage:'event-table-containment-6b',files:pair('exp-events-containment')},
 {stage:'author-consent',files:['docs/sql/circle-message-ai-consent.sql']},
 {stage:'inactive-ai-allowance',files:['docs/sql/circle-message-ai-allowance.sql']},
 {stage:'review-coverage',files:['docs/sql/circle-review-coverage.sql']},
 {stage:'correlated-listing-receipts',files:['docs/sql/circle-listing-review-receipt-apply.sql']},
 {stage:'atomic-reward-accounting',files:['docs/sql/thinker-reward-accounting.sql']},
 {stage:'saved-reading',files:pair('reading-progress')},
 {stage:'attendance',files:pair('circle-attendance')},
 {stage:'membership-intent',files:pair('circle-membership-intent')},
 {stage:'profile-intent',files:pair('member-profile-intent')},
 {stage:'published-circle-references',files:pair('circle-public-profiles')},
 {stage:'author-consent-intent',files:pair('circle-message-ai-consent-intent')},
]);
export const LIMITS=Object.freeze({
 database:'Disposable cached PGlite, single backend. No live SQL, external service, credentials, or provider invocation.',
 schema:'Exact saved three-table Circle catalog with existing documented synthetic weekly schedule, external child FK and role grantor exceptions. Expanded members, artifacts, exp_events and four private core tables are bounded synthetic prerequisites, not a full restore.',
 reading:'The tracked-schema scenario has Progress open/Highlights open; its privacy predecessor runs before core containment. The dated catalog instead captures no policies and RLS=false on these tables; its separately labeled projected pre-state skips cleanup. Neither is a current live-state claim. Never run cleanup after saved-reading CAS.',
 rewards:'Exact pinned captured legacy reward CREATE definitions. The private-event control is explicitly synthetic; separately named captured-event scenarios replay the saved broad grants and owner SELECT policy. Core/RPC containment does not close that event authority.',
 defaults:'Saved broad Circle default ACLs remain active. No fixture-only role/grant normalization occurs between real stages.',
 identity:'All member identities, content, reports and reviewer grants are synthetic owner setup. No reviewer provisioning or production identity acceptance.',
 rollback:'Only reviewed disable-only successors are exercised after use. Core/artifact/reward restoring rollbacks are not represented as safe. Coverage and accounting retain used receipts; no destructive reverse is invented.',
});
export async function execute(f,path,phase='apply'){
 const text=await source(path),entry={database:f.label,phase,path,sha256:evidence.sources[path],outcome:'running'};
 evidence.executions.push(entry);
 try{const result=await f.db.exec(text);entry.outcome='committed';return result;}
 catch(error){await f.db.exec('ROLLBACK');entry.outcome='refused';entry.code=error.code??null;entry.message=error.message;throw error;}
}
export async function createFullChainDb(label,{recordedEventGrants=false,recordedReadingBaseline=false}={}){
 const db=await live.createLiveDb();evidence.databasesCreated++;let closed=false;
 const f={db,label,async close(){if(closed)return;await db.close();closed=true;evidence.databasesClosed++;}};
 try{
  // All fixture schema preparation occurs before the first reviewed migration.
  await db.exec(`ALTER TABLE members DROP COLUMN profile_visibility;
   ALTER TABLE members ADD COLUMN supabase_auth_id uuid,ADD COLUMN wallet_address text UNIQUE,
    ADD COLUMN email text,ADD COLUMN stripe_customer_id text,ADD COLUMN tier text,ADD COLUMN exp_tokens integer DEFAULT 10,
    ADD COLUMN bio text,ADD COLUMN discipline text,ADD COLUMN skills text[],ADD COLUMN project_description text,
    ADD COLUMN seeking text,ADD COLUMN philosophy text,ADD COLUMN private_text text;
   ALTER TABLE members ENABLE ROW LEVEL SECURITY;
   CREATE POLICY synthetic_old_public_members ON members FOR SELECT USING(true);
   ALTER TABLE book_reflections ADD COLUMN member_id uuid,ADD COLUMN private_text text;
   CREATE TABLE great_books_progress(id uuid PRIMARY KEY,member_id uuid,private_text text);
   CREATE TABLE great_books_highlights(id uuid PRIMARY KEY,member_id uuid,private_text text);
   CREATE TABLE thinker_memory(id uuid PRIMARY KEY,member_id uuid,private_text text);
   CREATE TABLE artifacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),member_id uuid REFERENCES members(id) ON DELETE CASCADE,
    thinker_id text NOT NULL,title text NOT NULL,description text,philosophical_note text,prompt_used text,image_url text,thumbnail_url text,
    theme jsonb DEFAULT '{"combinedFixtureOnly":true}',conversation_context text,is_public boolean DEFAULT true,created_at timestamptz DEFAULT now());
   ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Members insert own artifacts" ON artifacts FOR INSERT TO PUBLIC WITH CHECK(true);
   CREATE POLICY "Public artifacts visible to all" ON artifacts FOR SELECT TO PUBLIC USING(is_public=true);
   CREATE TABLE nft_mints(id uuid PRIMARY KEY,artifact_id uuid REFERENCES artifacts(id) ON DELETE CASCADE);
   CREATE TABLE artifact_merch(id uuid PRIMARY KEY,artifact_id uuid REFERENCES artifacts(id));
   REVOKE ALL ON nft_mints,artifact_merch FROM PUBLIC,anon,authenticated,service_role;
   CREATE TABLE exp_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),member_id uuid REFERENCES members(id),amount integer NOT NULL,reason text);
   ALTER TABLE exp_events ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON exp_events FROM PUBLIC,anon,authenticated,service_role;
   GRANT SELECT,INSERT,UPDATE,DELETE ON exp_events TO service_role;`);
  await execute(f,'supabase/great_books.sql','fixture-tracked-legacy-schema');
  if(recordedReadingBaseline){
   const capture=CATALOG_PROJECTION.reading;
   const names=['reading_progress','book_highlights'];
   assert.deepEqual(capture.policyQueryIncludedTables,names);
   assert.deepEqual(capture.policies,[]);
   for(const table of names){
    const grants=capture.grants.filter(x=>x.table_name===table);assert.deepEqual(grants.map(x=>x.role),['anon','authenticated','service_role']);
    for(const row of grants){assert.equal(row.rls,false);assert(row.can_select&&row.can_insert&&row.can_update&&row.can_delete&&row.can_truncate);}
   }
   // Fixture projection only, before the first migration: the tracked schema
   // defines column shapes, while this captured pre-state has no policies/RLS.
   await db.exec('DROP POLICY "Progress open" ON reading_progress;DROP POLICY "Highlights open" ON book_highlights;ALTER TABLE reading_progress DISABLE ROW LEVEL SECURITY;ALTER TABLE book_highlights DISABLE ROW LEVEL SECURITY;');
   evidence.observations.push({database:label,name:'captured zero-policy reading pre-state established before all reviewed stages',outcome:'pass',
    source:CATALOG_PROJECTION_PATH,policyProjection:'/reading',tables:names,rls:false,liveStateClaim:false});
  }
  await db.exec('GRANT ALL ON members,reading_progress,book_highlights,great_books_progress,great_books_highlights,book_reflections,thinker_memory,artifacts TO anon,authenticated,service_role;');
  await db.query("UPDATE members SET supabase_auth_id=id,email='PRIVATE_SYNTHETIC_EMAIL',stripe_customer_id='PRIVATE_SYNTHETIC_BILLING',tier='protected',exp_tokens=7,private_text='PRIVATE_SYNTHETIC_MEMBER'");
  await db.query("INSERT INTO reading_progress(member_id,book_id,section_id,paragraph_index) VALUES($1,'meditations','synthetic-legacy-section',3)",[IDS.host]);
  await db.query("INSERT INTO book_highlights(member_id,book_id,passage) VALUES($1,'meditations','PRIVATE_SYNTHETIC_HIGHLIGHT')",[IDS.host]);
  for(const table of ['great_books_progress','great_books_highlights','book_reflections','thinker_memory'])await db.query(`INSERT INTO ${table}(id,member_id,private_text) VALUES($1,$1,'PRIVATE_SYNTHETIC_READING')`,[IDS.host]);
  await db.query("INSERT INTO artifacts(member_id,thinker_id,title,prompt_used,conversation_context,is_public) VALUES($1,'socrates','Synthetic public work','PRIVATE_SYNTHETIC_PROMPT','PRIVATE_SYNTHETIC_CONTEXT',true)",[IDS.host]);
  const bodyPath='verification/web/tests/fixtures/reward-live-bodies-2026-11-04.json',bodyText=await source(bodyPath);
  assert.equal(evidence.sources[bodyPath],'e8a8a02d150e120adca9ccab34b0994564a4beb217cf36ab392ce832405211a0');
  for(const body of JSON.parse(bodyText).functions)await db.exec(body.definition);
  await db.exec('GRANT EXECUTE ON FUNCTION public.add_exp(uuid,integer,text),public.increment_exp(uuid,integer),public.increment_exp_tokens(uuid,integer) TO PUBLIC,anon,authenticated,service_role;');
  if(recordedEventGrants){
   const {grants,policies}=CATALOG_PROJECTION.event;
   assert.deepEqual(grants.map(x=>x.role),['anon','authenticated','service_role']);
   for(const row of grants){assert(row.rls&&row.can_select&&row.can_insert&&row.can_update&&row.can_delete&&row.can_truncate);
    assert.equal(row.explicit_acl,'{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}');}
   assert.deepEqual(policies,[{table_name:'exp_events',policy_name:'EXP events visible to owner',command:'r',permissive:true,roles:'{PUBLIC}',
    using_expression:'(member_id IN ( SELECT members.id\n   FROM members\n  WHERE (members.supabase_auth_id = auth.uid())))',check_expression:null}]);
   await db.exec(`CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT ALL ON exp_events TO anon,authenticated,service_role;
    CREATE POLICY "EXP events visible to owner" ON exp_events FOR SELECT TO PUBLIC USING ${policies[0].using_expression};`);
   evidence.observations.push({database:label,name:'captured exp_events ACL and SELECT policy seeded before migrations',outcome:'pass',
    projections:['/queries/grants/data/12','/queries/grants/data/13','/queries/grants/data/14','/queries/policies/data/0'],authFunction:'Synthetic auth.uid stub; no real identity',httpExploitClaim:false});
  }
  return f;
 }catch(error){await f.close();throw error;}
}
export async function installFullChain(f,{documentedOrder=false,skipReadingCleanup=false,omitEventContainment=false,from=ORDERED_STAGES[0].stage,through='author-consent-intent'}={}){
 assert(ORDERED_STAGES.some(x=>x.stage===from)&&ORDERED_STAGES.some(x=>x.stage===through),'Unknown rehearsal stage');
 let started=false;
 for(const entry of ORDERED_STAGES){
  if(entry.stage===from)started=true;if(!started)continue;
  if((documentedOrder||skipReadingCleanup)&&entry.stage==='recognized-reading-policy-baseline'){
   evidence.omittedStages.push({database:f.label,stage:entry.stage,reason:documentedOrder?'Preserved original tracked-schema plan-order control':'Captured zero-policy pre-state needs no legacy policy cleanup'});continue;
  }
  if(omitEventContainment&&entry.stage==='event-table-containment-6b'){
   evidence.omittedStages.push({database:f.label,stage:entry.stage,reason:'Preserved pre-correction control, not the current complete chain'});continue;
  }
  for(const file of entry.files)await execute(f,file,entry.stage);
  if(entry.stage===through)return;
 }
}
export async function rpc(f,name,params=[],role='service_role'){
 assert(/^soe_[a-z_]+$/.test(name));
 return asRole(f.db,role,async tx=>(await tx.query(`SELECT public.${name}(${params.map((_,i)=>'$'+(i+1)).join(',')}) value`,params)).rows[0].value);
}
export async function scalar(f,sql,args=[]){return Object.values((await f.db.query(sql,args)).rows[0])[0];}
export async function snapshotPreState(f){
 const rows={};
 for(const table of ['members','reading_progress','book_highlights','great_books_progress','great_books_highlights','book_reflections','thinker_memory','artifacts','exp_events']){
  const columns=(await f.db.query("SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",[table])).rows.map(x=>x.attname);
  assert(columns.every(x=>/^[a-z_]+$/.test(x)));rows[table]={columns,rows:(await f.db.query('SELECT '+columns.join(',')+' FROM '+table+' ORDER BY id')).rows};
 }
 return{rows,circles:await snapshotLegacyRows(f.db),defaults:(await f.db.query('SELECT * FROM pg_default_acl ORDER BY oid')).rows,
  rewardDefinitions:(await f.db.query("SELECT oid::text,proname,proowner::text,prosecdef,proconfig,proargnames,md5(prosrc) hash,pg_get_expr(proargdefaults,0) defaults FROM pg_proc WHERE proname IN('add_exp','increment_exp','increment_exp_tokens') ORDER BY proname")).rows};
}
export async function verifyPreStatePreserved(f,before){
 for(const [table,{columns,rows}] of Object.entries(before.rows))assert.deepEqual((await f.db.query('SELECT '+columns.join(',')+' FROM '+table+' ORDER BY id')).rows,rows,table+' original data');
 assert.deepEqual(await snapshotLegacyRows(f.db),before.circles);
 assert.deepEqual((await f.db.query('SELECT * FROM pg_default_acl ORDER BY oid')).rows,before.defaults);
 assert.deepEqual((await snapshotPreState(f)).rewardDefinitions,before.rewardDefinitions);
 evidence.observations.push({database:f.label,name:'original rows, captured reward definitions and global default ACLs survive complete composition',outcome:'pass',originalRowTables:12});
}
export async function verifySourceStability(){for(const path of Object.keys(evidence.sources))await source(path);}
