import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {offlineApp} from './support/offline-app.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const dependencies=createRequire(path.join(ROOT,'package.json'));
const Anthropic=dependencies('@anthropic-ai/sdk').default;
const MEMBER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const CURRENT='claude-haiku-5-5';
const GATEWAY='anthropic/claude-haiku-5.5';

function success(model) {
  return new Response(JSON.stringify({id:'msg_synthetic',type:'message',role:'assistant',model,
    content:[{type:'text',text:JSON.stringify({votes:[{thinker:'Socrates',position:'REFRAME',one_liner:'Name the evidence'}],
      best_quote:'State what evidence would change the decision.',best_quote_thinker:'Socrates',session_theme:'Evidence first'})}],
    stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:10,output_tokens:10}}),
  {headers:{'content-type':'application/json'}});
}

function fixture({env={},actor=MEMBER,owner,readFailure=false,transport}={}) {
  const app=offlineApp({root:ROOT});
  app.context.process.env={ANTHROPIC_API_KEY:'SYNTHETIC_DIRECT_ONLY',...env};
  app.context.console={info(){},warn(){},log(){},error(){}};
  const db=app.fakes.resetDb({council_sessions:owner?[{session_id:'synthetic-session',member_id:owner}]:[]});
  if(readFailure)db.networkDown={cause:'SYNTHETIC_FAILURE'};
  const calls=[],clients=[];
  class OfflineClient extends Anthropic {
    constructor(options) {
      const route={providerBaseURL:options.baseURL||'https://api.anthropic.com',authMechanism:options.apiKey?'api-key':'oidc'};
      super({...options,baseURL:'https://synthetic-council.invalid',timeout:2000,logLevel:'off',
        fetch:async(input,request)=>{
          assert.equal(new URL(String(input)).origin,'https://synthetic-council.invalid');
          const headers=new Headers(request.headers);
          assert.equal(headers.get('x-api-key'),options.apiKey||null);
          assert.equal(headers.get('authorization'),options.authToken?'Bearer '+options.authToken:null);
          const call={body:JSON.parse(request.body),retryCount:headers.get('x-stainless-retry-count'),...route};
          calls.push(call);
          return transport?transport(call,calls.length,db):success(call.body.model);
        }});
      clients.push({maxRetries:this.maxRetries,...route});
    }
  }
  app.setMock('@anthropic-ai/sdk',()=>OfflineClient);
  app.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>db}));
  app.setMock('@/lib/getAuthenticatedMember',()=>({getAuthenticatedMember:async()=>actor?{memberId:actor}:null}));
  const route=app.load('app/api/council/verdict/route.ts');
  const body={sessionId:'synthetic-session',question:'Should we test one assumption first?',
    responses:[{thinker:'Socrates',response:'State what evidence would change the decision.'}]};
  return {app,db,calls,clients,post:(extra={})=>route.POST(app.fakes.makeReq({...body,...extra},
    {url:'https://synthetic-soe.invalid/api/council/verdict'}))};
}

test('Council direct default uses the existing supported model and reaches one private save',async()=>{
  const f=fixture(),r=await f.post();assert.equal(r.status,200);
  assert.match(r.headers.get('cache-control'),/private.*no-store/);
  const value=await r.json();assert.equal(value.publicUrl,null);assert.equal(value.slug,null);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.model,CURRENT);assert.equal(f.calls[0].body.max_tokens,400);
  assert.equal(f.clients[0].maxRetries,2);assert.equal(f.db.log.filter(x=>x.op==='upsert').length,1);
  assert.equal(value.session.member_id,MEMBER);assert.equal(value.session.is_public,false);
  assert.deepEqual([...new Set(f.db.log.map(x=>x.table))],['council_sessions']);
});

test('Council preserves direct and gateway selection, credential mechanism and override precedence',async()=>{
  const configs=[
    {env:{MOVEMENT_CLAUDE_MODEL:'synthetic-owner-model'},model:'synthetic-owner-model'},
    {env:{AI_GATEWAY_API_KEY:'SYNTHETIC_GATEWAY_ONLY'},model:GATEWAY},
    {env:{VERCEL_OIDC_TOKEN:'SYNTHETIC_OIDC_ONLY'},model:GATEWAY},
    {env:{AI_GATEWAY_API_KEY:'SYNTHETIC_GATEWAY_ONLY',VERCEL_OIDC_TOKEN:'SYNTHETIC_OIDC_ONLY'},model:GATEWAY},
    {env:{AI_GATEWAY_API_KEY:'SYNTHETIC_GATEWAY_ONLY',AI_GATEWAY_ENABLED:'false'},model:CURRENT},
    {env:{AI_GATEWAY_API_KEY:'SYNTHETIC_GATEWAY_ONLY',AI_GATEWAY_ANTHROPIC_MODEL:'synthetic/generic'},model:'synthetic/generic'},
    {env:{AI_GATEWAY_API_KEY:'SYNTHETIC_GATEWAY_ONLY',AI_GATEWAY_ANTHROPIC_MODEL:'synthetic/generic',AI_GATEWAY_CONTENT_MODEL:'synthetic/content'},model:'synthetic/content'},
    {env:{AI_GATEWAY_API_KEY:'SYNTHETIC_GATEWAY_ONLY',MOVEMENT_CLAUDE_MODEL:'synthetic-direct'},model:GATEWAY},
    {env:{AI_GATEWAY_CONTENT_MODEL:'synthetic/content'},model:CURRENT},
    {env:{AI_GATEWAY_API_KEY:'SYNTHETIC_GATEWAY_ONLY',AI_GATEWAY_ANTHROPIC_BASE_URL:'https://synthetic-configured-gateway.invalid'},model:GATEWAY},
  ];
  for(const config of configs){
    const f=fixture({env:config.env}),r=await f.post();assert.equal(r.status,200);assert.equal(f.calls.length,1);
    assert.equal(f.calls[0].body.model,config.model);
    const gateway=config.env.AI_GATEWAY_ENABLED!=='false'&&Boolean(config.env.AI_GATEWAY_API_KEY||config.env.VERCEL_OIDC_TOKEN);
    assert.equal(f.calls[0].providerBaseURL,gateway?(config.env.AI_GATEWAY_ANTHROPIC_BASE_URL||'https://ai-gateway.vercel.sh'):'https://api.anthropic.com');
    assert.equal(f.calls[0].authMechanism,gateway&&!config.env.AI_GATEWAY_API_KEY?'oidc':'api-key');
  }
});

test('Invalid input, unauthenticated requests, another owner and read errors stop before model work',async()=>{
  for(const [settings,body,status]of [[{}, {responses:[]},400],[{actor:null},{},401],[{owner:OTHER},{},403],[{readFailure:true},{},500]]){
    const f=fixture(settings),r=await f.post(body);assert.equal(r.status,status);assert.equal(f.calls.length,0);
    assert.equal(f.db.log.filter(x=>x.op==='upsert').length,0);
  }
});

test('Council keeps the existing member request limit ahead of provider work',async()=>{
  const f=fixture(),limiter=f.app.load('lib/rateLimit.ts');
  for(let i=0;i<limiter.LIMITS.member.max;i++)assert.equal(limiter.limitModelCall(new Request('https://synthetic-soe.invalid'),MEMBER,'council-verdict'),null);
  const r=await f.post();assert.equal(r.status,429);assert.ok(Number(r.headers.get('retry-after'))>0);
  assert.equal(f.calls.length,0);assert.equal(f.db.log.filter(x=>x.op==='upsert').length,0);
});

test('Retryable provider failure retains the current three-attempt ceiling and never saves a verdict',async()=>{
  const f=fixture({transport:()=>new Response(JSON.stringify({type:'error',error:{type:'overloaded_error',message:'SYNTHETIC_PRIVATE_FAILURE'}}),
    {status:503,headers:{'content-type':'application/json','retry-after-ms':'1'}})});
  const r=await f.post();assert.equal(r.status,500);assert.deepEqual(f.calls.map(x=>x.retryCount),['0','1','2']);
  assert.equal((await r.json()).error,'Failed to analyze verdict');assert.equal(f.db.log.filter(x=>x.op==='upsert').length,0);
});

test('A failed verdict save is reported honestly after a successful synthetic model response',async()=>{
  const f=fixture({transport:(call,_attempt,db)=>{db.networkDown={cause:'SYNTHETIC_WRITE_FAILURE'};return success(call.body.model);}});
  const r=await f.post();assert.equal(r.status,500);assert.equal((await r.json()).error,'Failed to save verdict');
  assert.equal(f.calls.length,1);assert.equal(f.db.rows('council_sessions').length,0);
});

test('Only the existing explicit true boolean makes the synthetic verdict public',async()=>{
  for(const makePublic of [undefined,false,'true',true]){
    const f=fixture(),r=await f.post({makePublic}),value=await r.json();assert.equal(r.status,200);
    assert.equal(value.session.is_public,makePublic===true);assert.equal(Boolean(value.publicUrl),makePublic===true);
    assert.equal(Boolean(value.slug),makePublic===true);
  }
});
