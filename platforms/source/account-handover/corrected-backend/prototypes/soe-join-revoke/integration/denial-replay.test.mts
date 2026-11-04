import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMobileClient} from '../../../mobile/src/client.ts';
import {validRead} from '../../../mobile/src/validation.ts';
import {createLocalPrototypePort} from './mobile-local-port.ts';
import {createWorld} from '../src/world.js';
import {createHttp} from '../src/http.js';
import {payloadHash} from '../src/hash.js';
const PLAN='plan-riverside';

async function setup() {
  const world=createWorld();const server=createHttp(world);const {url}=await server.listen(0);
  const ada=await world.signIn('ada','synthetic-ada'),jules=await world.signIn('jules','synthetic-jules');let key=0;
  const write=(actor:string,endpoint:string,body:any)=>world.write((actor==='ada'?ada:jules).token,endpoint,{personId:actor,idempotencyKey:`denial-${++key}`,payloadHash:payloadHash(body),body});
  await write('jules','join',{planId:PLAN});await write('ada','accept',{planId:PLAN,requesterId:'jules'});
  await write('jules','grant',{planId:PLAN,otherId:'ada'});await write('ada','grant',{planId:PLAN,otherId:'jules'});
  let captured:any;let substitute:any;let readFailure=false;
  const fetcher:typeof fetch=async(input,init)=>{
    const response=await fetch(input,init);
    if(String(input).endsWith(`/api/plans/${PLAN}`)) {
      if(readFailure)throw Error('Deliberate transient read delivery failure');
      if(substitute!==undefined)return new Response(JSON.stringify(substitute),{headers:{'content-type':'application/json'}});
      if(response.ok)captured=await response.clone().json();
    }
    return response;
  };
  const port=createLocalPrototypePort({url,personId:'jules',token:jules.token,fetcher});const client=createMobileClient(port);
  await client.boot();await client.reviewPlan(PLAN);await client.refresh();assert.equal(client.heldRelay(),'relay:ada.linden');
  return {world,server,url,jules,client,port,write,captured:()=>structuredClone(captured),replay:(x:any)=>{substitute=x;},fail:(value:boolean)=>{readFailure=value;}};
}
function hidden(client:ReturnType<typeof createMobileClient>) {
  assert.equal(client.heldRelay(),null,'Known denial must not be reversed by an old contact response');
  assert.equal(client.screen().relay.value,null);
  const c=client as any;assert.doesNotMatch(JSON.stringify({plan:c.plan,memory:c.memory,screen:client.screen()}),/relay:ada\.linden/);
}
function packet(old:any,version:number) {return {...structuredClone(old),version,data:{...structuredClone(old.data),version}};}

for(const via of ['plan','visibility'])test(`known ${via} denial rejects older and equal-version contact replays over real HTTP`,async()=>{
  const h=await setup();try {
    const old=h.captured();const block=await h.write('ada','block',{otherId:'jules'});assert.equal(block.version,old.version+1);
    await(via==='plan'?h.client.refresh():h.client.reviewPlan(PLAN));hidden(h.client);
    for(const version of [old.version-1,old.version,block.version]) {
      h.replay(packet(old,version));await h.client.foregroundRefresh();hidden(h.client);
      assert.notEqual(h.client.screen().truthful,'committed');
    }
    assert.equal((h.client as any).highWater.get(`plan:${PLAN}:jules`),block.version);
    console.log('DENIAL_REPLAY_WITHHELD',JSON.stringify({via,capturedVersion:old.version,denialVersion:block.version,replayedVersions:[old.version-1,old.version,block.version]}));
  }finally{await h.server.close();}
});

test('denial watermark never moves backward and strictly newer coherent state can recover',async()=>{
  const h=await setup();try {
    const old=h.captured();const deny=(version:number)=>({status:'rejected',planId:PLAN,version,error:'This plan is unavailable.'});
    for(const v of [8,6,7]){h.replay(deny(v));await h.client.refresh();hidden(h.client);}
    assert.equal((h.client as any).highWater.get(`plan:${PLAN}:jules`),8);
    h.replay(packet(old,8));await h.client.foregroundRefresh();hidden(h.client);
    h.replay(packet(old,9));await h.client.foregroundRefresh();assert.equal(h.client.heldRelay(),'relay:ada.linden');
    h.replay(deny(6));await h.client.refresh();hidden(h.client);
    assert.equal((h.client as any).highWater.get(`plan:${PLAN}:jules`),9);
    h.replay(packet(old,8));await h.client.foregroundRefresh();hidden(h.client);
  }finally{await h.server.close();}
});

for(const boundary of ['wire','injected-port'])test(`malformed ${boundary} denial cannot poison or remove an established barrier`,async()=>{
  const h=await setup();try {
    const old=h.captured();const block=await h.write('ada','block',{otherId:'jules'});await h.client.refresh();hidden(h.client);
    const plan=h.port.plan.bind(h.port);
    const invalids=[undefined,null,0,-1,1.5,'6',NaN,Infinity,Number.MAX_SAFE_INTEGER+1].map(version=>({status:'rejected',planId:PLAN,version,error:'Unavailable'}));
    invalids.push({status:'rejected',planId:'another-plan',version:99,error:'Unavailable'},{status:'rejected',planId:PLAN,version:99,error:null});
    for(const invalid of invalids) {
      assert.equal(validRead(invalid,'plan',PLAN),false);
      if(boundary==='wire')h.replay(invalid);else h.port.plan=async()=>invalid as any;
      await h.client.foregroundRefresh();hidden(h.client);
      assert.equal((h.client as any).highWater.get(`plan:${PLAN}:jules`),block.version);
    }
    h.port.plan=plan;h.replay(old);await h.client.foregroundRefresh();hidden(h.client);
    assert.equal(validRead({status:'rejected',planId:PLAN,version:6,error:'Unavailable'},'discover'),false);
  }finally{await h.server.close();}
});

test('a transient delivery failure does not become an authoritative denial',async()=>{
  const h=await setup();try {
    h.fail(true);await h.client.refresh();hidden(h.client);
    h.fail(false);await h.client.foregroundRefresh();assert.equal(h.client.heldRelay(),'relay:ada.linden');
  }finally{await h.server.close();}
});
