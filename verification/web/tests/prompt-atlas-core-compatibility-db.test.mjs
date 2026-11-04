import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import {
  CORE_TABLES, IDS, asRole, atlasCatalog, atlasDigests, contain, fixture,
  helperSource, runSource, sourceManifest,
} from './support/prompt-atlas-core-db.mjs';

const referenceFile = new URL('./fixtures/prompt-member-dependency-digests-2026-11-04.json', import.meta.url);
const referenceStat = await stat(referenceFile);
assert.ok(referenceStat.size > 0 && referenceStat.blocks > 0, 'metadata reference must already be materialized');
const referenceCatalog = JSON.parse(await readFile(referenceFile, 'utf8'));

const denied = error => error.code === '42501';
const rows = async (db, role, subject, query, params) => (await asRole(db, role, subject, query, params)).rows;
const ids = result => result.map(row => row.id).sort();
const memberA = (db, query, params) => rows(db, 'authenticated', IDS.subjectA, query, params);

test('complete unchanged Prompt Atlas migration and actual core/identity scripts preserve helper, all eight policies and invoker view', async t => {
  const db = await fixture(t, { contained: false }), before = await atlasCatalog(db);
  assert.equal(before.policies.length, 8);
  assert.equal(before.policies.reduce((count,policy)=>count+Number(policy.qual!==null)+Number(policy.check_expr!==null),0),11);
  assert.deepEqual(helperSource, { characters: 84, md5: '182a380be15d0befdd53a047060dd37b' });
  assert.equal(before.helper[0].body_md5, helperSource.md5);
  assert.equal(before.helper[0].body_characters, helperSource.characters);
  assert.equal(before.helper[0].prosecdef, true);
  assert.equal(before.helper[0].provolatile, 's');
  assert.deepEqual(before.helper[0].proconfig, ['search_path=public']);
  assert.deepEqual(before.view[0].reloptions, ['security_invoker=true']);
  assert.equal((await db.query(`SELECT count(DISTINCT d.objid)::int policies,count(*)::int expressions
    FROM pg_depend d WHERE d.refobjid='public.current_prompt_member_id()'::regprocedure
      AND d.classid='pg_policy'::regclass`)).rows[0].policies, 8);
  assert.equal((await rows(db,'anon',null,'SELECT email FROM members')).length,4, 'fixture baseline really permits raw reads');
  await contain(db);
  assert.deepEqual(await atlasCatalog(db), before);
  assert.equal(Object.keys(sourceManifest).length, 5);
  for (const role of ['anon','authenticated','service_role']) {
    assert.equal((await db.query("SELECT has_function_privilege($1,'public.current_prompt_member_id()','EXECUTE') allowed", [role])).rows[0].allowed, true);
  }
  await runSource(db,'identityApply');
  await runSource(db,'coreApply');
  assert.deepEqual(await atlasCatalog(db), before, 'repeat actual apply keeps Atlas unchanged');
});

test('local PG17.5 normalized policy/view metadata matches the existing metadata-only catalog receipt', async t => {
  const db=await fixture(t),actual=await atlasDigests(db);
  assert.deepEqual(actual.policies,referenceCatalog.policies);
  const {owner:localOwner,...localView}=actual.leaderboard;
  const {owner:referenceOwner,...referenceView}=referenceCatalog.leaderboard;
  assert.deepEqual(localView,referenceView);
  assert.equal(localOwner,(await db.query('SELECT current_user name')).rows[0].name);
  t.diagnostic('PROMPT_ATLAS_CATALOG '+JSON.stringify({
    ...actual,referenceOwner,policyAndViewDigestsMatch:true,
    aclComparison:'Not equivalent: local base-table CRUD/service-view SELECT are explicit synthetic grants; no live ACL reproduction.',
  }));
});

test('raw seven-table browser reads are denied while exact definer helper maps distinct subject to own member only', async t => {
  const db = await fixture(t);
  assert.notEqual(IDS.memberA, IDS.subjectA);
  for (const [role,subject,expected] of [
    ['authenticated',IDS.subjectA,IDS.memberA],
    ['authenticated',IDS.subjectB,IDS.memberB],
    ['authenticated',IDS.unknownSubject,null],
    ['authenticated',null,null],
    ['anon',null,null],
  ]) {
    for (const table of CORE_TABLES) await assert.rejects(asRole(db,role,subject,`SELECT * FROM ${table}`),denied);
    assert.equal((await rows(db,role,subject,'SELECT current_prompt_member_id() id'))[0].id,expected);
  }
  assert.equal((await rows(db,'service_role',null,'SELECT email FROM members WHERE id=$1',[IDS.memberA]))[0].email,'FICTIONAL_PRIVATE_A');
  await assert.rejects(asRole(db,'authenticated',IDS.subjectA,'SELECT current_prompt_member_id($1::uuid)',[IDS.memberB]),error=>error.code==='42883');
});

test('actual identity uniqueness prevents ambiguous subject mapping while retaining multiple null-subject members', async t => {
  const db = await fixture(t);
  await assert.rejects(db.query('UPDATE members SET supabase_auth_id=$1 WHERE id=$2',[IDS.subjectA,IDS.memberB]),error=>error.code==='23505');
  await assert.rejects(db.query('INSERT INTO members(id,supabase_auth_id) VALUES($1,$2)',[IDS.created,IDS.subjectA]),error=>error.code==='23505');
  assert.equal((await db.query('SELECT count(*)::int n FROM members WHERE supabase_auth_id IS NULL')).rows[0].n,2);
  assert.equal((await memberA(db,'SELECT current_prompt_member_id() id'))[0].id,IDS.memberA);
  assert.equal((await rows(db,'authenticated',IDS.subjectB,'SELECT current_prompt_member_id() id'))[0].id,IDS.memberB);
});

test('actual prompt SELECT policy exposes published rows plus own private/unlisted rows and excludes foreign private/future/unpublished rows', async t => {
  const db = await fixture(t);
  assert.deepEqual(ids(await rows(db,'anon',null,'SELECT id FROM prompts')),[IDS.published]);
  assert.deepEqual(ids(await memberA(db,'SELECT id FROM prompts')),[IDS.published,IDS.privateA,IDS.unlistedA].sort());
  assert.deepEqual(ids(await rows(db,'authenticated',IDS.subjectB,'SELECT id FROM prompts')),[IDS.published,IDS.privateB,IDS.futureB,IDS.unpublishedB].sort());
  assert.deepEqual(ids(await rows(db,'authenticated',IDS.unknownSubject,'SELECT id FROM prompts')),[IDS.published]);
});

test('actual prompt INSERT/UPDATE/DELETE policies bind member ID, reject subject/foreign ownership and cannot mutate foreign private rows', async t => {
  const db = await fixture(t);
  const insert = `INSERT INTO prompts(id,title,description,category,prompt_text,created_by,slug,visibility)
    VALUES($1::uuid,'Created fixture','SYNTHETIC description','think','SYNTHETIC prompt text',$2::uuid,($1::uuid)::text,'private') RETURNING id`;
  for (const owner of [IDS.memberB,IDS.subjectA,null]) await assert.rejects(asRole(db,'authenticated',IDS.subjectA,insert,[IDS.created,owner]),denied);
  await assert.rejects(asRole(db,'anon',null,insert,[IDS.created,IDS.memberA]),denied);
  assert.deepEqual(ids(await memberA(db,insert,[IDS.created,IDS.memberA])),[IDS.created]);
  assert.equal((await memberA(db,"UPDATE prompts SET title='Own updated fixture' WHERE id=$1 RETURNING id",[IDS.created])).length,1);
  await assert.rejects(asRole(db,'authenticated',IDS.subjectA,'UPDATE prompts SET created_by=$1 WHERE id=$2',[IDS.memberB,IDS.created]),denied);
  assert.deepEqual(await memberA(db,"UPDATE prompts SET title='Forged fixture' WHERE id=$1 RETURNING id",[IDS.privateB]),[]);
  assert.deepEqual(await memberA(db,'DELETE FROM prompts WHERE id=$1 RETURNING id',[IDS.privateB]),[]);
  assert.deepEqual(ids(await memberA(db,'DELETE FROM prompts WHERE id=$1 RETURNING id',[IDS.created])),[IDS.created]);
  assert.equal((await db.query('SELECT title FROM prompts WHERE id=$1',[IDS.privateB])).rows[0].title,'Private fixture B');
});

for (const table of ['prompt_favorites','prompt_votes']) test(`actual ${table} ALL policy fences own SELECT/INSERT/UPDATE/DELETE after core containment`, async t => {
  const db = await fixture(t);
  assert.deepEqual(await memberA(db,`SELECT member_id FROM ${table}`),[{member_id:IDS.memberA}]);
  assert.deepEqual(await rows(db,'anon',null,`SELECT member_id FROM ${table}`),[]);
  await assert.rejects(asRole(db,'authenticated',IDS.subjectA,`INSERT INTO ${table}(member_id,prompt_id) VALUES($1,$2)`,[IDS.memberB,IDS.privateA]),denied);
  await assert.rejects(asRole(db,'authenticated',IDS.subjectA,`UPDATE ${table} SET member_id=$1 WHERE member_id=$2`,[IDS.memberB,IDS.memberA]),denied);
  await memberA(db,`INSERT INTO ${table}(member_id,prompt_id) VALUES($1,$2)`,[IDS.memberA,IDS.privateA]);
  assert.equal((await memberA(db,`UPDATE ${table} SET prompt_id=$1 WHERE member_id=$2 AND prompt_id=$3 RETURNING member_id`,[IDS.unlistedA,IDS.memberA,IDS.privateA])).length,1);
  assert.deepEqual(await memberA(db,`DELETE FROM ${table} WHERE member_id=$1 RETURNING member_id`,[IDS.memberB]),[]);
  assert.equal((await memberA(db,`DELETE FROM ${table} WHERE member_id=$1 AND prompt_id=$2 RETURNING member_id`,[IDS.memberA,IDS.unlistedA])).length,1);
  assert.equal((await db.query(`SELECT count(*)::int n FROM ${table} WHERE member_id=$1`,[IDS.memberB])).rows[0].n,1);
});

test('actual entitlement/run SELECT policies expose own rows only and grant no browser writes even with synthetic table CRUD grants', async t => {
  const db = await fixture(t);
  for (const table of ['prompt_entitlements','prompt_runs']) {
    assert.deepEqual(await memberA(db,`SELECT member_id FROM ${table}`),[{member_id:IDS.memberA}]);
    assert.deepEqual(await rows(db,'authenticated',IDS.subjectB,`SELECT member_id FROM ${table}`),[{member_id:IDS.memberB}]);
    for (const [role,subject] of [['anon',null],['authenticated',null],['authenticated',IDS.unknownSubject]]) assert.deepEqual(await rows(db,role,subject,`SELECT member_id FROM ${table}`),[]);
    assert.deepEqual(await memberA(db,`DELETE FROM ${table} RETURNING member_id`),[]);
  }
  await assert.rejects(asRole(db,'authenticated',IDS.subjectA,'INSERT INTO prompt_entitlements(member_id) VALUES($1)',[IDS.walletA]),denied);
  await assert.rejects(asRole(db,'authenticated',IDS.subjectA,'INSERT INTO prompt_runs(member_id,input_hash) VALUES($1,$2)',[IDS.memberA,'1'.repeat(64)]),denied);
  assert.deepEqual(await memberA(db,"UPDATE prompt_entitlements SET plan='explorer_pro' RETURNING member_id"),[]);
  assert.deepEqual(await memberA(db,"UPDATE prompt_runs SET status='completed' RETURNING member_id"),[]);
});

test('security-invoker leaderboard remains queryable and counts only caller-visible favorites/votes, not global browser counts', async t => {
  const db = await fixture(t);
  for (const [role,subject,count] of [['anon',null,0],['authenticated',IDS.subjectA,1],['authenticated',IDS.subjectB,1],['service_role',null,2]]) {
    const result=await rows(db,role,subject,'SELECT id,favorite_count::int favorites,vote_count::int votes,momentum::int FROM prompt_community_leaderboard');
    assert.deepEqual(result,[{id:IDS.published,favorites:count,votes:count,momentum:count*10}]);
  }
  const countBefore=(await memberA(db,'SELECT favorite_count::int n FROM prompt_community_leaderboard'))[0].n;
  await memberA(db,'DELETE FROM prompt_favorites WHERE member_id=$1',[IDS.memberA]);
  assert.equal((await memberA(db,'SELECT favorite_count::int n FROM prompt_community_leaderboard'))[0].n,countBefore-1);
  assert.equal((await rows(db,'authenticated',IDS.subjectB,'SELECT favorite_count::int n FROM prompt_community_leaderboard'))[0].n,1);
});

test('actual service-only invoker accounting functions stay executable by service and denied to browsers after containment', async t => {
  const db = await fixture(t);
  const reserve='SELECT * FROM reserve_prompt_run($1::uuid,$2::uuid,$3::text)';
  for (const role of ['anon','authenticated']) await assert.rejects(asRole(db,role,role==='anon'?null:IDS.subjectA,reserve,[IDS.memberA,IDS.published,'2'.repeat(64)]),denied);
  const reserved=(await rows(db,'service_role',null,reserve,[IDS.memberA,IDS.published,'2'.repeat(64)]))[0];
  assert.equal(reserved.runs_limit,5);
  assert.equal(Number(reserved.runs_used),2);
  const finish='SELECT finish_prompt_run($1::uuid,$2::prompt_run_status,$3::text,$4::integer,$5::integer,$6::integer,$7::text)';
  for (const role of ['anon','authenticated']) await assert.rejects(asRole(db,role,role==='anon'?null:IDS.subjectA,finish,[reserved.run_id,'completed','SYNTHETIC_MODEL',1,2,3,null]),denied);
  await rows(db,'service_role',null,finish,[reserved.run_id,'completed','SYNTHETIC_MODEL',1,2,3,null]);
  assert.equal((await memberA(db,'SELECT status FROM prompt_runs WHERE id=$1',[reserved.run_id]))[0].status,'completed');
  assert.equal((await db.query('SELECT usage_count::int n FROM prompts WHERE id=$1',[IDS.published])).rows[0].n,1);
});
