// Cross-stage synthetic compatibility probe, NOT a95-table restore. The three
// Circle tables reuse the catalog fixture; member/profile/reading/child schemas
// below are explicit minimal stubs. No production rows or provider identities.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLiveDb,installCircleChain,runSql,rpc,requestId,IDS,snapshotLegacyRows,asRole} from './support/circle-live-db.mjs';
import {bindHallDatabase} from './support/hall-db-http-fixture.mjs';
const ROOT=new URL('../../../',import.meta.url);
export const COMPATIBILITY_SQL=Object.freeze([
 'docs/sql/first-release-core-containment-preflight.sql','docs/sql/first-release-core-containment-apply.sql',
 'docs/sql/member-identity-preflight.sql','docs/sql/member-identity-unique.sql',
 'docs/sql/member-profile-preflight.sql','docs/sql/member-profile-apply.sql',
 'docs/sql/circle-legacy-baseline-preflight.sql','docs/sql/circle-legacy-baseline-apply.sql',
 'supabase/migrations/20261027_soe_circles.sql','docs/sql/circle-moderation.sql','docs/sql/circle-message-moderation.sql',
 'docs/sql/circle-participation.sql','docs/sql/circle-reading-programs.sql','docs/sql/circle-passage-posts.sql',
 'docs/sql/circle-discussion-threads.sql','docs/sql/circle-discovery-unicode.sql','docs/sql/circle-discovery-search.sql',
 'docs/sql/book-salon-conversation.sql','docs/sql/artifact-containment-preflight.sql','docs/sql/artifact-containment-apply.sql',
]);
const reading=['reading_progress','book_highlights','great_books_progress','great_books_highlights','book_reflections','thinker_memory'];
const targets=['members',...reading,'book_cohorts','book_cohort_members','seminar_messages','artifacts'];
const PUBLIC_ARTIFACT='abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', PRIVATE_ARTIFACT='abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const privateReadingRows=db=>Promise.all(reading.map(async table=>({table,rows:(await db.query('SELECT id,member_id,private_text FROM '+table+' ORDER BY id')).rows})));
async function sql(db,file){try{return await db.exec(await readFile(new URL(file,ROOT),'utf8'));}catch(error){await db.exec('ROLLBACK');throw error;}}
async function fixture(t){
 const db=await createLiveDb();t.after(()=>db.close());
 // Fixture scaffolding only: replace the minimal circle fixture's synthetic
 // publication column with the full reviewed profile migration prerequisite.
 await db.exec(`ALTER TABLE members DROP COLUMN profile_visibility;
  ALTER TABLE members ADD COLUMN supabase_auth_id uuid, ADD COLUMN wallet_address text UNIQUE,
   ADD COLUMN email text, ADD COLUMN stripe_customer_id text, ADD COLUMN tier text, ADD COLUMN exp_tokens integer,
   ADD COLUMN bio text, ADD COLUMN discipline text, ADD COLUMN skills text[], ADD COLUMN project_description text,
   ADD COLUMN seeking text, ADD COLUMN philosophy text, ADD COLUMN private_text text;
  ALTER TABLE members ENABLE ROW LEVEL SECURITY; CREATE POLICY synthetic_old_public_members ON members FOR SELECT USING(true);
  ALTER TABLE book_reflections ADD COLUMN member_id uuid,ADD COLUMN private_text text;`);
 for(const table of reading.filter(t=>t!=='book_reflections'))await db.exec(`CREATE TABLE ${table}(id uuid PRIMARY KEY,member_id uuid,private_text text)`);
 await db.exec(`CREATE TABLE artifacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  thinker_id text NOT NULL,title text NOT NULL,description text,philosophical_note text,prompt_used text,image_url text,thumbnail_url text,
  theme jsonb DEFAULT '{"combinedFixtureOnly":true}',conversation_context text,is_public boolean DEFAULT true,created_at timestamptz DEFAULT now());
  ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Members insert own artifacts" ON artifacts FOR INSERT TO PUBLIC WITH CHECK(true);
  CREATE POLICY "Public artifacts visible to all" ON artifacts FOR SELECT TO PUBLIC USING(is_public=true);
  CREATE TABLE nft_mints(id uuid PRIMARY KEY,artifact_id uuid REFERENCES artifacts(id) ON DELETE CASCADE);
  CREATE TABLE artifact_merch(id uuid PRIMARY KEY,artifact_id uuid REFERENCES artifacts(id));
  REVOKE ALL ON nft_mints,artifact_merch FROM PUBLIC,anon,authenticated,service_role;
  GRANT ALL ON members,reading_progress,book_highlights,great_books_progress,great_books_highlights,book_reflections,thinker_memory,artifacts TO anon,authenticated,service_role;`);
 await db.query("UPDATE members SET supabase_auth_id=id,email='PRIVATE_SYNTHETIC_EMAIL',stripe_customer_id='PRIVATE_SYNTHETIC_BILLING',tier='protected',exp_tokens=7,private_text='PRIVATE_SYNTHETIC_MEMBER'");
 for(const table of reading)await db.query(`INSERT INTO ${table}(id,member_id,private_text) VALUES($1,$1,'PRIVATE_SYNTHETIC_READING')`,[IDS.host]);
 await db.query(`INSERT INTO artifacts(id,member_id,thinker_id,title,description,prompt_used,conversation_context,is_public)
  VALUES($1,$3,'socrates','Public synthetic work','Safe public text','PRIVATE_SYNTHETIC_PROMPT','PRIVATE_SYNTHETIC_CONTEXT',true),
   ($2,$3,'socrates','PRIVATE_SYNTHETIC_TITLE',NULL,'PRIVATE_SYNTHETIC_PROMPT2','PRIVATE_SYNTHETIC_CONTEXT2',false)`,[PUBLIC_ARTIFACT,PRIVATE_ARTIFACT,IDS.host]);
 const legacy=await snapshotLegacyRows(db),artifacts=(await db.query('SELECT * FROM artifacts ORDER BY id')).rows;
 const members=(await db.query('SELECT * FROM members ORDER BY id')).rows,originalReading=await privateReadingRows(db);
 for(const file of COMPATIBILITY_SQL.slice(0,6))await sql(db,file);
 await installCircleChain(db);await runSql(db,'docs/sql/book-salon-conversation.sql');
 await sql(db,'docs/sql/artifact-containment-preflight.sql');await sql(db,'docs/sql/artifact-containment-apply.sql');
 return {db,legacy,artifacts,members,originalReading};
}
test('twenty actual SQL files compose without changing original rows or reopening any of eleven raw targets',async t=>{
 const {db,legacy,artifacts,members,originalReading}=await fixture(t);
 assert.equal(COMPATIBILITY_SQL.length,20);assert.deepEqual(await snapshotLegacyRows(db),legacy);
 assert.deepEqual((await db.query('SELECT * FROM artifacts ORDER BY id')).rows,artifacts);
 assert.deepEqual(await privateReadingRows(db),originalReading);
 assert.deepEqual((await db.query('SELECT * FROM members ORDER BY id')).rows.map(({profile_visibility,profile_revision,...row})=>{
  assert.equal(profile_visibility,'private');assert.equal(profile_revision,0);return row;
 }),members);
 for(const role of ['anon','authenticated'])for(const table of targets){
  await assert.rejects(asRole(db,role,tx=>tx.query('SELECT * FROM '+table)),e=>e.code==='42501');
  const privileges=(await db.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') granted,has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') columns",[role,table])).rows[0];
  assert.deepEqual(privileges,{granted:false,columns:false});
 }
 for(const table of targets){for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) yes',['service_role',table,privilege])).rows[0].yes,true);}
 await assert.rejects(sql(db,'docs/sql/first-release-core-containment-rollback.sql'),e=>e.code==='PT409');
 await assert.rejects(sql(db,'docs/sql/circle-legacy-baseline-rollback.sql'),e=>e.code==='PT409');
 assert.deepEqual((await db.query('SELECT * FROM artifacts ORDER BY id')).rows,artifacts);
});
test('profile publication, ordinary post, Circle discussion and actual Hall API coexist behind the composed boundaries',async t=>{
 const {db}=await fixture(t);
 const profile=async(revision,patch)=>asRole(db,'service_role',async tx=>(await tx.query('SELECT public.soe_member_profile_update($1,$2,$3::jsonb) value',[IDS.host,revision,JSON.stringify(patch)])).rows[0].value);
 assert.deepEqual((await rpc(db,'soe_book_salon_messages_read',[null,IDS.salon])).members,[]);
 assert.equal((await profile(0,{visibility:'public',bio:'Public synthetic biography'})).profile_revision,1);
 assert.equal((await rpc(db,'soe_book_salon_messages_read',[null,IDS.salon])).members[0].id,IDS.host);
 assert.equal((await profile(1,{visibility:'private'})).profile_revision,2);
 assert.deepEqual((await rpc(db,'soe_book_salon_messages_read',[null,IDS.salon])).members,[]);
 const salon=await rpc(db,'soe_book_salon_messages_post',[IDS.host,IDS.salon,'Composed ordinary post','Synthetic host']);
 assert.equal(salon.outcome,'confirmed');assert.equal((await rpc(db,'soe_book_salon_messages_read',[IDS.host,IDS.salon])).messages.find(m=>m.id===salon.message.id).is_mine,true);
 const {day,weekday}=(await db.query("SELECT to_char(CURRENT_DATE+1,'YYYY-MM-DD') AS day,extract(dow FROM CURRENT_DATE+1)::int AS weekday")).rows[0];
 const circle=await rpc(db,'soe_circle_create',[IDS.host,requestId(),{title:'Composed synthetic Circle',description:'Safe offline compatibility probe.',format:'in_person',city:'Synthetic City',region:null,venueName:'Synthetic library',venueType:'library',weekday,time:'19:00',timezone:'UTC',startDate:day,maxMembers:8,onlineUrl:null}]);
 const post=await rpc(db,'soe_circle_discussion_post',[IDS.host,circle.circleId,requestId(),'Composed protected Circle post',null,null,null,'Synthetic host']);
 assert.equal(post.message.content,'Composed protected Circle post');
 assert.equal((await rpc(db,'soe_circle_discussion_read',[IDS.host,circle.circleId,null,25])).items[0].id,post.message.id);
 await assert.rejects(rpc(db,'soe_circle_discussion_read',[IDS.host,circle.circleId,null,25],'anon'),e=>e.code==='42501');
 const hall=bindHallDatabase(db),response=await hall.get('?thinker=socrates');assert.equal(response.status,200);
 const page=await response.json();assert.deepEqual(page.items.map(x=>x.id),[PUBLIC_ARTIFACT]);assert.doesNotMatch(JSON.stringify(page),/PRIVATE_SYNTHETIC|member_id|image_url|prompt_used|context|theme|created_at|is_public/);assert.equal(hall.authCalls,0);
 await db.query('UPDATE artifacts SET is_public=false WHERE id=$1',[PUBLIC_ARTIFACT]);assert.deepEqual((await (await hall.get()).json()).items,[]);
 const row=(await db.query('SELECT email,stripe_customer_id,tier,exp_tokens FROM members WHERE id=$1',[IDS.host])).rows[0];
 assert.deepEqual(row,{email:'PRIVATE_SYNTHETIC_EMAIL',stripe_customer_id:'PRIVATE_SYNTHETIC_BILLING',tier:'protected',exp_tokens:7});
 await assert.rejects(asRole(db,'service_role',tx=>tx.query('INSERT INTO members(id,supabase_auth_id,display_name) VALUES($1,$2,$3)',[requestId(),IDS.host,'Duplicate synthetic subject'])),e=>e.code==='23505');
});
