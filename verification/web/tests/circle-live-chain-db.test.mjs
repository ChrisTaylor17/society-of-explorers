import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { offlineApp } from './support/offline-app.mjs';
import {
  LIVE_CATALOG, LIVE_TABLES, LIVE_FIXTURE_EXCEPTIONS, IDS, createLiveDb,
  readLiveFixtureCatalog, snapshotLegacyRows, runSql, installCircleChain,
  CIRCLE_SQL_CHAIN, asRole, rpc, requestId,
} from './support/circle-live-db.mjs';

const CATALOG = JSON.parse(JSON.stringify(offlineApp().load('lib/circles/discovery-catalog.ts').DISCOVERY_SEARCH_CATALOG));
const EDITIONS = JSON.parse(await readFile(new URL('../../../lib/circles/reading-program-editions.json', import.meta.url), 'utf8'));
const fixture = async (t, installed = true) => {
  const db = await createLiveDb(); t.after(() => db.close());
  if (installed) await installCircleChain(db);
  return db;
};
const sorted = rows => rows.map(row => JSON.stringify(row)).sort();
const rejects = (fn, code) => assert.rejects(fn, e => e.code === code);
const defaults = async db => (await db.query(`SELECT c.relname,a.attname,pg_get_expr(d.adbin,d.adrelid) AS expression
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1) AND a.attnum>0 ORDER BY c.relname,a.attnum`, [LIVE_TABLES])).rows;
async function input(db, overrides = {}) {
  const { day, weekday } = (await db.query(`SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+1,'YYYY-MM-DD') AS day,
    extract(dow FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+1)::int AS weekday`)).rows[0];
  return { title:'Synthetic catalog rehearsal Circle', description:'Offline synthetic members and transport only.',
    format:'in_person', city:'Synthetic City', region:null, venueName:'Synthetic public library', venueType:'library',
    weekday, time:'19:00', timezone:'UTC', startDate:day, maxMembers:8, onlineUrl:null, ...overrides };
}
const detail = (db, actor, circle) => rpc(db, 'soe_circle_detail', [actor, circle]);
async function participate(db, action, actor, circle, extras = []) {
  const revision = Number((await db.query('SELECT circle_participation_revision FROM book_cohorts WHERE id=$1',[circle])).rows[0].circle_participation_revision);
  return rpc(db, `soe_circle_${action}`, [actor,circle,revision,requestId(),...extras]);
}
const archive = (db, actor, circle, before = null) => rpc(db,'soe_circle_discussion_read',[actor,circle,before,25]);
async function post(db, actor, circle, content, parent = null, key = requestId()) {
  const target = parent ? (await rpc(db,'soe_circle_discussion_target',[actor,circle,parent])).target : null;
  return rpc(db,'soe_circle_discussion_post',[actor,circle,key,content,parent,target?.revision??null,target?.contentHash??null,'Synthetic verified display']);
}
const search = db => rpc(db,'soe_circle_discovery_search',[{terms:[],cityTerms:[],format:'',open:false,sort:'next',book:null,edition:null},CATALOG,null,null,25]);

test('live-schema rehearsal has networking denied from process startup', () => {
  assert.throws(() => fetch('https://fixture.invalid/never-send'), /EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
});

test('catalog receipt is reproduced with only declared synthetic and PostgreSQL OID exceptions', async t => {
  const db = await fixture(t, false), actual = await readLiveFixtureCatalog(db);
  for (const key of ['roles','tables','constraints','indexes','policies','table_acls','effective_table_privileges','default_acls','inheritance']) {
    assert.deepEqual(sorted(actual[key]), sorted(LIVE_CATALOG[key]), key);
  }
  const columns = actual.columns.map(c => {
    if (c.table !== 'book_cohorts' || c.name !== 'weekly_schedule') return c;
    assert.equal(c.default_expression, `'{"syntheticFixtureOnly": true}'::jsonb`);
    const expected = LIVE_CATALOG.columns.find(x => x.table === c.table && x.name === c.name);
    return { ...c, default_expression:expected.default_expression, default_md5:expected.default_md5 };
  });
  assert.deepEqual(columns,LIVE_CATALOG.columns);
  assert.equal(LIVE_FIXTURE_EXCEPTIONS.weeklySchedule.observedExpressionMD5,'8b4b2df56ad0773943ef9179742da01b');
  assert.deepEqual(sorted(actual.role_memberships.map(e => ({...e,grantor:'supabase_admin'}))),sorted(LIVE_CATALOG.role_memberships));
  assert.equal(actual.role_memberships.every(e => e.grantor === 'web_user'),true);
  const normalize = trigger => {
    const { name, definition_md5, ...rest } = trigger;
    return { ...rest, definition:rest.definition.replace(/RI_ConstraintTrigger_([ac])_\d+/g,'RI_ConstraintTrigger_$1_LOCAL_OID') };
  };
  assert.equal(actual.triggers.length,10);
  assert.deepEqual(sorted(actual.triggers.map(normalize)),sorted(LIVE_CATALOG.triggers.map(normalize)));
  assert.equal(actual.constraints.some(c => /member_id.*REFERENCES/.test(c.definition)),false);
  await rejects(() => db.query('DELETE FROM book_cohorts WHERE id=$1',[IDS.salon]),'23503');
  await db.query('INSERT INTO book_reflections(id,cohort_id) VALUES($1,$2)',[requestId(),IDS.orphanCohort]);
  await rejects(() => db.query('DELETE FROM book_cohorts WHERE id=$1',[IDS.orphanCohort]),'23503');
});

test('strict baseline plus all nine SQL files preserves historical sender data, defaults and incoming FK semantics', async t => {
  const db = await fixture(t, false), before = await snapshotLegacyRows(db), priorDefaults = await defaults(db);
  const initial = await readLiveFixtureCatalog(db);
  await installCircleChain(db);
  assert.deepEqual(await snapshotLegacyRows(db),before);
  const afterDefaults = await defaults(db);
  for (const prior of priorDefaults) assert.deepEqual(afterDefaults.find(d => d.relname===prior.relname && d.attname===prior.attname),prior);
  const column = (await db.query(`SELECT a.attnotnull,a.atthasdef,format_type(a.atttypid,a.atttypmod) AS type
    FROM pg_attribute a WHERE a.attrelid='seminar_messages'::regclass AND a.attname='member_name'`)).rows[0];
  assert.deepEqual(column,{attnotnull:false,atthasdef:false,type:'text'});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM seminar_messages WHERE member_name IS NOT NULL')).rows[0].n,0);
  const after = await readLiveFixtureCatalog(db);
  assert.equal(after.policies.length,5);
  assert.equal(after.policies.every(p => !p.permissive && p.roles.every(r => ['anon','authenticated'].includes(r))),true);
  assert.equal(after.tables.every(table => table.rls),true);
  assert.deepEqual(sorted(after.default_acls),sorted(initial.default_acls));
  for(const role of ['anon','authenticated']) await rejects(() => asRole(db,role,tx=>tx.query('SELECT * FROM seminar_messages')),'42501');
  await rejects(() => runSql(db,'docs/sql/circle-legacy-baseline-rollback.sql'),'PT409');
  await db.exec('ROLLBACK');
  assert.deepEqual(await snapshotLegacyRows(db),before);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='book_cohorts'::regclass AND tgisinternal AND tgconstrrelid='book_reflections'::regclass")).rows[0].n,2);
});

test('actual service RPCs create, join, post, reply, read, moderate, withdraw and discover against the sanitized baseline', async t => {
  const db = await fixture(t), oldRows = await snapshotLegacyRows(db), creationKey = requestId(), creationInput = await input(db);
  const created = await rpc(db,'soe_circle_create',[IDS.host,creationKey,creationInput]), circle = created.circleId;
  assert.equal(created.replayed,false);
  assert.equal((await rpc(db,'soe_circle_create',[IDS.host,creationKey,creationInput])).replayed,true);
  await rejects(()=>rpc(db,'soe_circle_create',[IDS.host,creationKey,{...creationInput,title:'Conflicting synthetic title'}]),'PT409');
  assert.equal((await db.query('SELECT thinker_id FROM book_cohorts WHERE id=$1',[circle])).rows[0].thinker_id,'socrates');
  await rejects(()=>archive(db,IDS.reader,circle),'PT403');
  await participate(db,'join',IDS.reader,circle);
  const current = await detail(db,IDS.reader,circle);
  assert.equal(current.viewer.is_member,true); assert.equal(current.capabilities.canReadConversation,true);
  await participate(db,'rsvp',IDS.reader,circle,[creationInput.startDate,'going']);
  const key=requestId(), original=await post(db,IDS.host,circle,'Synthetic independently authored parent evidence.',null,key);
  const replay=await post(db,IDS.host,circle,'Synthetic independently authored parent evidence.',null,key);
  assert.equal(replay.message.id,original.message.id); assert.equal(replay.replayed,true);
  const reply=await post(db,IDS.reader,circle,'Synthetic independently authored reply.',original.message.id);
  assert.equal(reply.message.parentMessageId,original.message.id);
  const thread=await rpc(db,'soe_circle_discussion_thread',[IDS.reader,circle,reply.message.id,null,25]);
  assert.equal(thread.root.id,original.message.id);assert.equal(thread.items[0].id,reply.message.id);
  assert.deepEqual(Object.keys(thread.items[0]).sort(),['id','member_name','content','created_at','is_mine','visibility','parentMessageId','rootMessageId'].sort());
  const stored=(await db.query('SELECT sender_type,sender_name,thinker_id,passage_reference,member_name FROM seminar_messages WHERE id=$1',[original.message.id])).rows[0];
  assert.deepEqual(stored,{sender_type:'member',sender_name:null,thinker_id:null,passage_reference:null,member_name:'Synthetic verified display'});
  await db.query('INSERT INTO circle_reviewer_grants(cohort_id,member_id) VALUES($1,$2)',[circle,IDS.reviewer]);
  const state=await rpc(db,'soe_circle_message_state',[IDS.reader,circle,original.message.id]);
  await rpc(db,'soe_circle_message_action',[IDS.reader,circle,original.message.id,state.revision,state.contentHash,requestId(),'report','safety','Synthetic private report evidence.']);
  const review=await rpc(db,'soe_circle_message_review_detail',[IDS.reviewer,circle,original.message.id]);
  await rpc(db,'soe_circle_message_review_decide',[IDS.reviewer,circle,original.message.id,review.revision,review.contentHash,requestId(),'hide','safety','Synthetic reviewer independently considered this evidence.',null,'parent evidence']);
  const held=(await archive(db,IDS.reader,circle)).items.find(m=>m.id===original.message.id);
  assert.equal(held.visibility,'hidden'); assert.equal(held.content,null);
  assert.equal((await archive(db,IDS.reader,circle)).items.find(m=>m.id===reply.message.id).content,'Synthetic independently authored reply.');
  const own=await rpc(db,'soe_circle_message_state',[IDS.host,circle,original.message.id]);
  await rpc(db,'soe_circle_message_action',[IDS.host,circle,original.message.id,own.revision,own.contentHash,requestId(),'withdraw',null,null]);
  assert.equal((await archive(db,IDS.reader,circle)).items.find(m=>m.id===original.message.id).visibility,'withdrawn');
  const discovered=await search(db);assert.deepEqual(discovered.items.map(item=>item.circle.id),[circle]);
  const serialized=JSON.stringify(discovered);
  for(const privateField of ['member_id','created_by','reporter','online_url','contentHash','Synthetic private report'])assert.equal(serialized.includes(privateField),false);
  await participate(db,'leave',IDS.reader,circle);
  await rejects(()=>archive(db,IDS.reader,circle),'PT403');
  await rejects(()=>post(db,IDS.outsider,circle,'Synthetic unauthorized text.'),'PT403');
  await participate(db,'complete',IDS.host,circle);
  assert.equal((await search(db)).items.length,0);
  // Existing rows retain every original column; new Circle rows are excluded.
  const after=await snapshotLegacyRows(db);
  for(const table of LIVE_TABLES)assert.deepEqual(after[table].filter(row=>oldRows[table].some(old=>old.id===row.id)),oldRows[table]);
});

test('pinned reading program and passage RPC work without any invented member foreign key', async t => {
  const db=await fixture(t),edition=EDITIONS.find(e=>e.bookId==='apology');
  const program={version:1,bookId:edition.bookId,editionId:edition.editionId,sessions:[{from:0,to:10}]};
  const created=await rpc(db,'soe_circle_create',[IDS.host,requestId(),await input(db,{readingProgram:program})]);
  const header=await detail(db,IDS.host,created.circleId);
  assert.deepEqual(header.circle.circle_reading_program,program);
  const reference={version:1,bookId:edition.bookId,editionId:edition.editionId,blockIndex:0,start:0,end:24};
  const content='Synthetic independent comment.\n\nSynthetic source excerpt for SQL isolation only.\nSource: synthetic fixture credits.';
  const key=requestId(),first=await rpc(db,'soe_circle_passage_post',[IDS.host,created.circleId,key,content,reference,'Synthetic verified host']);
  assert.equal(first.replayed,false);
  assert.equal((await rpc(db,'soe_circle_passage_receipt',[IDS.host,created.circleId,key])).message.id,first.message.id);
  assert.equal((await archive(db,IDS.host,created.circleId)).items[0].id,first.message.id);
});

test('broad default grants do not leave browser table, column, TRUNCATE, MAINTAIN or function authority anywhere in the installed Circle closure', async t => {
  const db=await fixture(t);
  const tables=(await db.query(`SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND (c.relname=ANY($1) OR c.relname LIKE 'circle_%' OR c.relname='soe_circle_legacy_baseline_v1_state') ORDER BY c.relname`,[LIVE_TABLES])).rows;
  assert.ok(tables.length>15);
  for(const role of ['anon','authenticated']) {
    for(const table of tables) {
      for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) {
        assert.equal((await db.query('SELECT has_table_privilege($1,$2::oid,$3) AS allowed',[role,table.oid,privilege])).rows[0].allowed,false,`${role} ${table.relname} ${privilege}`);
      }
      for(const privilege of ['SELECT','INSERT','UPDATE','REFERENCES'])assert.equal((await db.query('SELECT has_any_column_privilege($1,$2::oid,$3) AS allowed',[role,table.oid,privilege])).rows[0].allowed,false,`${role} ${table.relname} column ${privilege}`);
      await rejects(()=>asRole(db,role,tx=>tx.query(`SELECT * FROM public.${table.relname} LIMIT 0`)),'42501');
      await rejects(()=>asRole(db,role,tx=>tx.exec(`TRUNCATE public.${table.relname} CASCADE`)),'42501');
    }
    await rejects(()=>asRole(db,role,tx=>tx.query('SELECT content FROM seminar_messages')),'42501');
    await rejects(()=>asRole(db,role,tx=>tx.exec("INSERT INTO seminar_messages(content) VALUES('Synthetic forbidden raw insert')")),'42501');
    await rejects(()=>asRole(db,role,tx=>tx.exec("UPDATE seminar_messages SET content='Synthetic forbidden update' WHERE false")),'42501');
    await rejects(()=>asRole(db,role,tx=>tx.exec('DELETE FROM seminar_messages WHERE false')),'42501');
    await rejects(()=>rpc(db,'soe_circle_discussion_read',[IDS.host,IDS.salon,null,25],role),'42501');
    const executable=(await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND (p.proname LIKE 'soe_circle_%' OR p.proname LIKE '_soe_circle_%') AND has_function_privilege($1,p.oid,'EXECUTE')`,[role])).rows;
    assert.deepEqual(executable,[]);
  }
  const publicACLs=(await db.query(`SELECT c.relname FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=ANY($1::oid[]) AND a.grantee=0`,[tables.map(t=>t.oid)])).rows;
  assert.deepEqual(publicACLs,[]);
  // Accidental SELECT regrant still sees zero rows without permissive policies.
  await db.exec('GRANT SELECT ON seminar_messages,book_cohorts,book_cohort_members TO anon,authenticated');
  for(const role of ['anon','authenticated'])for(const table of LIVE_TABLES)assert.equal((await asRole(db,role,tx=>tx.query(`SELECT count(*)::int AS n FROM ${table}`))).rows[0].n,0);
});

test('strict participation preflight rejects later column-authority drift without creating its receipt table', async t => {
  const db=await fixture(t,false);
  await runSql(db,'docs/sql/circle-legacy-baseline-apply.sql');
  for(const path of CIRCLE_SQL_CHAIN.slice(0,3))await runSql(db,path);
  await db.exec('GRANT SELECT(content) ON seminar_messages TO authenticated');
  await assert.rejects(()=>runSql(db,'docs/sql/circle-participation.sql'),e=>e.code==='P0001' && /Strict legacy Circle baseline protection requires review/.test(e.message));
  await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT to_regclass('public.circle_participation_receipts') AS object")).rows[0].object,null);
});

test('message migration refuses an object collision atomically after the strict baseline', async t => {
  const db=await fixture(t,false);
  await runSql(db,'docs/sql/circle-legacy-baseline-apply.sql');
  for(const path of CIRCLE_SQL_CHAIN.slice(0,2))await runSql(db,path);
  await db.exec('CREATE TABLE circle_message_states(synthetic_collision text)');
  await rejects(()=>runSql(db,'docs/sql/circle-message-moderation.sql'),'42P07');
  await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policy WHERE polname LIKE 'soe_circle_%'")).rows[0].n,0);
  assert.equal((await db.query("SELECT to_regclass('public.circle_message_reports') AS object")).rows[0].object,null);
});
