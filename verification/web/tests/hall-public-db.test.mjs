import test from 'node:test';
import assert from 'node:assert/strict';
import {createHallDatabaseFixture} from './support/hall-db-http-fixture.mjs';
import {hallId} from './support/hall-http-fixture.mjs';
import {asRole} from './support/artifact-containment-fixture.mjs';

async function insert(db,n,{publicValue=true,thinker='socrates',title=`Synthetic creation ${n}`,created='2026-01-01T00:00:00Z'}={}) {
  await db.query(`INSERT INTO artifacts(id,thinker_id,title,description,philosophical_note,is_public,created_at,prompt_used,image_url,thumbnail_url,conversation_context,theme)
    VALUES($1,$2,$3,NULL,NULL,$4,$5,'PRIVATE_PROMPT','https://media.invalid/PRIVATE_IMAGE','PRIVATE_THUMBNAIL','PRIVATE_CONTEXT','{"private":"PRIVATE_THEME"}')`,[hallId(n),thinker,title,publicValue,created]);
}
const unavailable=async response=>{assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Hall unavailable.'});assert.match(response.headers.get('cache-control'),/private.*no-store/);};

test('actual API/SDK/service SQL filters120 private and null-public rows before limit and omits author/media/private fields under containment',async t=>{
  const f=await createHallDatabaseFixture(t);
  for(let n=1;n<=120;n++)await insert(f.db,n,{publicValue:n%2===0?false:null,created:'2030-01-01T00:00:00Z',title:'PRIVATE_PADDING'});
  await insert(f.db,500,{created:'2020-01-01T00:00:00Z'});
  const response=await f.get(),body=await response.json();assert.equal(response.status,200);
  assert.deepEqual(body.items.map(item=>item.id),[hallId(500)]);assert.deepEqual(body.page,{limit:48,hasMore:false});
  assert.deepEqual(Object.keys(body.items[0]),['id','thinker_id','title','description','philosophical_note']);
  assert.doesNotMatch(JSON.stringify(body),/PRIVATE_|member_id|image_url|thumbnail_url|prompt_used|conversation_context|theme|created_at|is_public/);
  assert.equal(f.authCalls,0);assert.equal(f.requests.length,1);assert.equal(f.requests[0].abortSignalPresent,true);
  assert.ok(f.queries[0].includes('WHERE is_public=$1 ORDER BY'));
  await assert.rejects(asRole(f.db,'anon',tx=>tx.query('SELECT title FROM artifacts')),e=>e.code==='42501');
  await f.db.query('UPDATE artifacts SET is_public=false WHERE id=$1',[hallId(500)]);
  assert.deepEqual(await (await f.get()).json(),{items:[],page:{limit:48,hasMore:false}});
});

test('actual SDK SQL preserves deterministic newest-first UUID ties, NULLS LAST and the49th-row sentinel',async t=>{
  const f=await createHallDatabaseFixture(t);
  await insert(f.db,900,{created:null});await insert(f.db,901,{created:null});
  for(let n=1;n<=49;n++)await insert(f.db,n);
  const response=await f.get(),body=await response.json();assert.equal(response.status,200);
  assert.deepEqual(body.items.map(item=>item.id),Array.from({length:48},(_,i)=>hallId(49-i)));
  assert.deepEqual(body.page,{limit:48,hasMore:true});
  await f.db.query('UPDATE artifacts SET is_public=false WHERE id=$1',[hallId(49)]);
  await f.db.query('UPDATE artifacts SET is_public=false WHERE id=$1',[hallId(48)]);
  const after=await (await f.get()).json();assert.equal(after.items.length,48);assert.equal(after.page.hasMore,true);
  assert.equal(after.items.at(-1).id,hallId(901),'NULL dates sort after every dated row, with descending UUID tie');
  await f.db.query('UPDATE artifacts SET is_public=false WHERE id=$1',[hallId(47)]);
  const exact=await (await f.get()).json();assert.equal(exact.items.length,48);assert.equal(exact.page.hasMore,false);
  assert.deepEqual(exact.items.slice(-2).map(item=>item.id),[hallId(901),hallId(900)]);
});

test('optional thinker filter applies before49 even behind sixty newer published artifacts of other thinkers',async t=>{
  const f=await createHallDatabaseFixture(t);
  for(let n=1;n<=60;n++)await insert(f.db,n,{thinker:'plato',created:'2030-01-01T00:00:00Z'});
  await insert(f.db,500,{thinker:'socrates',created:'2020-01-01T00:00:00Z'});
  await insert(f.db,501,{thinker:'socrates',publicValue:false,created:'2031-01-01T00:00:00Z'});
  const all=await (await f.get()).json();assert.equal(all.items.length,48);assert.ok(all.items.every(item=>item.thinker_id==='plato'));
  const filtered=await (await f.get('?thinker=socrates')).json();assert.deepEqual(filtered.items.map(item=>item.id),[hallId(500)]);
  assert.deepEqual(filtered.page,{limit:48,hasMore:false});assert.ok(f.queries[1].includes('WHERE is_public=$1 AND thinker_id=$2 ORDER BY'));
});

test('malformed published SQL text, including a49th sentinel, is unavailable while malformed private text stays excluded',async t=>{
  const f=await createHallDatabaseFixture(t);
  await insert(f.db,1,{publicValue:false,title:'x'.repeat(201)});
  assert.deepEqual(await (await f.get()).json(),{items:[],page:{limit:48,hasMore:false}});
  await f.db.query('UPDATE artifacts SET is_public=true WHERE id=$1',[hallId(1)]);await unavailable(await f.get());
  await f.db.query('UPDATE artifacts SET is_public=false WHERE id=$1',[hallId(1)]);
  for(let n=2;n<=49;n++)await insert(f.db,n,{created:'2030-01-01T00:00:00Z'});
  await insert(f.db,100,{title:'x'.repeat(201),created:'2020-01-01T00:00:00Z'});
  await unavailable(await f.get());
});

test('missing Hall publication schema and lost service SELECT never masquerade as a verified empty Hall',async t=>{
  const missing=await createHallDatabaseFixture(t);
  await missing.db.exec('ALTER TABLE artifacts DROP COLUMN is_public CASCADE');await unavailable(await missing.get());
  const denied=await createHallDatabaseFixture(t);
  await denied.db.exec('REVOKE SELECT ON artifacts FROM service_role');await unavailable(await denied.get());
});
