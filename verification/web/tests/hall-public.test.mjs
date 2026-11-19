import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineApp } from './support/offline-app.mjs';
import { hallHttpFixture, hallRow, hallId, plain } from './support/hall-http-fixture.mjs';

const contract=offlineApp().load('lib/hall/public.ts');
const page=items=>({items,page:{limit:48,hasMore:false}});
const privateExtras={member_id:hallId(999),members:{display_name:'PRIVATE_AUTHOR'},image_url:'https://media.invalid/PRIVATE_IMAGE',
  thumbnail_url:'PRIVATE_THUMBNAIL',prompt_used:'PRIVATE_PROMPT',conversation_context:'PRIVATE_CONTEXT',theme:{secret:'PRIVATE_THEME'},created_at:'PRIVATE_DATE'};
const generic=async response=>{assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Hall unavailable.'});assert.match(response.headers.get('cache-control'),/private.*no-store/);};

test('Hall verification begins with external network transports disabled',()=>{
  assert.throws(()=>fetch('https://fixture.invalid/never-send'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
});

test('pure Hall row proof requires literal publication and reconstructs only five authored text fields',()=>{
  const parsed=contract.parsePublicHallRow(hallRow(1,privateExtras));
  assert.deepEqual(Object.keys(parsed),['id','thinker_id','title','description','philosophical_note']);
  assert.doesNotMatch(JSON.stringify(parsed),/PRIVATE_|member_id|members|image_url|thumbnail_url|prompt_used|conversation_context|theme|created_at|is_public/);
  for(const value of [false,null,undefined,0,1,'true'])assert.equal(contract.parsePublicHallRow(hallRow(1,{is_public:value})),null);
  assert.equal(contract.parsePublicHallRow(hallRow(1,{id:hallId(1).toUpperCase()})).id,hallId(1));
});

test('public Hall text enforces exact UTF16 boundaries, nonblank headings, plain controls and complete surrogate pairs',()=>{
  assert.ok(contract.parsePublicHallRow(hallRow(1,{title:'😀'.repeat(100),thinker_id:'😀'.repeat(50),description:'😀'.repeat(1000),philosophical_note:'\n\t'})));
  for(const extra of [{title:'😀'.repeat(100)+'x'},{thinker_id:'x'.repeat(101)},{description:'😀'.repeat(1000)+'x'},{philosophical_note:'x'.repeat(2001)},
    {title:''},{title:' \u00a0\ufeff'},{thinker_id:' '},{title:null},{thinker_id:null},{description:undefined},{philosophical_note:undefined},
    {title:'line\nbreak'},{thinker_id:'tab\tname'},{description:'private\u0001text'},{philosophical_note:'bad\u007ftext'},
    {title:'lone\ud800'},{thinker_id:'\udc00'},{description:'\ud800'},{philosophical_note:42},{id:'not-a-uuid'}])assert.equal(contract.parsePublicHallRow(hallRow(1,extra)),null,JSON.stringify(extra));
});

test('pure HTTP page parser rejects duplicate and fabricated paging while stripping all raw extras',()=>{
  assert.deepEqual(plain(contract.parsePublicHallPage({...page([hallRow(1,privateExtras)]),secret:'PRIVATE_PAGE'})),page([{id:hallId(1),thinker_id:'socrates',title:'Synthetic public creation',description:null,philosophical_note:null}]));
  for(const value of [null,{},page(null),page([hallRow(1),hallRow(1,{id:hallId(1).toUpperCase()})]),
    page(Array.from({length:49},(_,i)=>hallRow(i+1))),{items:[],page:{limit:48,hasMore:true}},
    {items:[],page:{limit:49,hasMore:false}},{items:[],page:{limit:48,hasMore:'false'}}])assert.equal(contract.parsePublicHallPage(value),null);
  assert.ok(contract.parsePublicHallPage({items:Array.from({length:48},(_,i)=>hallRow(i+1)),page:{limit:48,hasMore:true}}));
});

test('actual GET selects publication proof only and applies filters before deterministic49-row bound without auth',async()=>{
  const f=hallHttpFixture({data:[hallRow(1,privateExtras)]}),response=await f.get('https://soe.invalid/api/hall?thinker=socrates');
  assert.equal(response.status,200);assert.deepEqual(Object.keys(await response.json()),['items','page']);
  assert.deepEqual(f.calls,[{method:'from',table:'artifacts'},{method:'select',fields:'id,thinker_id,title,description,philosophical_note,is_public'},
    {method:'eq',field:'is_public',value:true},{method:'eq',field:'thinker_id',value:'socrates'},
    {method:'order',field:'created_at',options:{ascending:false,nullsFirst:false}},{method:'order',field:'id',options:{ascending:false}},
    {method:'limit',value:49},{method:'abortSignal'}]);
  assert.equal(f.authCalls,0);assert.equal(f.timers[0].ms,5000);assert.equal(f.timers[0].cleared,true);
  assert.ok(f.signal instanceof AbortSignal);assert.match(response.headers.get('cache-control'),/private.*no-store/);
});

test('unknown, repeated and unsupported Hall query parameters are rejected before any database work',async()=>{
  for(const query of ['thinker=unknown','thinker=','thinker=socrates&thinker=plato','thinker=SOCRATES','author=private','limit=100','thinker=socrates&extra=x']){
    const f=hallHttpFixture(),response=await f.get('https://soe.invalid/api/hall?'+query);
    assert.equal(response.status,400);assert.equal(f.adminCalls,0);assert.deepEqual(f.calls,[]);
    assert.match(response.headers.get('cache-control'),/private.*no-store/);
  }
  for(const thinker of contract.HALL_THINKERS)assert.deepEqual(plain(contract.parseHallQuery(new URLSearchParams({thinker}))),{thinker});
});

test('verified zero is the only empty success and49 valid rows produce exactly48 plus honest hasMore',async()=>{
  const empty=hallHttpFixture({data:[]});assert.deepEqual(await (await empty.get()).json(),{items:[],page:{limit:48,hasMore:false}});
  const full=hallHttpFixture({data:Array.from({length:49},(_,i)=>hallRow(i+1))}),response=await full.get(),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.items.length,48);assert.deepEqual(body.page,{limit:48,hasMore:true});assert.equal(body.items.some(row=>row.id===hallId(49)),false);
  for(const [length,hasMore]of [[47,false],[48,false]])assert.equal((await (await hallHttpFixture({data:Array.from({length},(_,i)=>hallRow(i+1))}).get()).json()).page.hasMore,hasMore);
});

test('provider errors, absent schema, malformed and nonpublic rows including the49th sentinel fail generic closed',async()=>{
  const cases=[{error:{code:'42703',message:'PRIVATE_SCHEMA service_role artifacts is_public'}},{data:null},{data:{}},
    {adminThrows:true},{data:[hallRow(1,{is_public:false})]},{data:[hallRow(1),hallRow(1)]},{data:[hallRow(1,{title:'\ud800'})]},
    {data:Array.from({length:50},(_,i)=>hallRow(i+1))},
    {data:[...Array.from({length:48},(_,i)=>hallRow(i+1)),hallRow(49,{is_public:null})]}];
  for(const options of cases)await generic(await hallHttpFixture(options).get());
  await generic(await hallHttpFixture({data:[hallRow(1,{thinker_id:'plato'})]}).get('https://soe.invalid/api/hall?thinker=socrates'));
  await generic(await hallHttpFixture({execute:()=>{throw Error('PRIVATE_PROVIDER_EXCEPTION');}}).get());
});

test('five-second deadline aborts the query and a nonabortable late success cannot replace the generic response',async()=>{
  let release;const f=hallHttpFixture({execute:()=>new Promise(resolve=>{release=resolve;})}),pending=f.get();
  for(let n=0;n<10&&!release;n++)await Promise.resolve();assert.ok(release);
  assert.equal(f.timers.length,1);assert.equal(f.timers[0].ms,5000);f.timers[0].fn();
  const response=await pending;await generic(response.clone());assert.equal(f.signal.aborted,true);assert.equal(f.timers[0].cleared,true);
  release({data:[hallRow()],error:null});for(let n=0;n<10;n++)await Promise.resolve();
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Hall unavailable.'});
});

test('request cancellation handles both pre-aborted and in-flight nonabortable transports without auth or late data',async()=>{
  const early=new AbortController();early.abort();const a=hallHttpFixture();await generic(await a.get(undefined,{signal:early.signal}));assert.equal(a.adminCalls,0);
  let release;const controller=new AbortController(),f=hallHttpFixture({execute:()=>new Promise(resolve=>{release=resolve;})});
  const pending=f.get(undefined,{signal:controller.signal});for(let n=0;n<10&&!release;n++)await Promise.resolve();assert.ok(release);
  controller.abort();const response=await pending;await generic(response);assert.equal(f.signal.aborted,true);
  release({data:[hallRow()],error:null});for(let n=0;n<10;n++)await Promise.resolve();assert.equal(f.authCalls,0);
});
