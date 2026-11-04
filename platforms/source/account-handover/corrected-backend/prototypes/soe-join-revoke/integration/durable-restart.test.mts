import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWorld} from '../src/world.js';
import {createHttp} from '../src/http.js';
import {payloadHash} from '../src/hash.js';
import {createMobileClient} from '../../../mobile/src/client.ts';
import {createLocalPrototypePort} from './mobile-local-port.ts';
const PLAN='plan-riverside';
test('durable backend restart preserves tokens, block receipt/version and client denial replay barrier',async()=>{
 const databasePath=join(await mkdtemp(join(tmpdir(),'soe-durable-http-')),'world.sqlite');
 let world=createWorld({databasePath}),server=createHttp(world);let {url}=await server.listen(0);const port=Number(new URL(url).port);let serial=0;
 const ada=await world.signIn('ada','synthetic-ada'),jules=await world.signIn('jules','synthetic-jules');
 const write=(actor:string,endpoint:string,body:any,key='restart-'+(++serial))=>world.write((actor==='ada'?ada:jules).token,endpoint,{personId:actor,idempotencyKey:key,payloadHash:payloadHash(body),body});
 let old:any,replay=false;
 const fetcher:typeof fetch=async(input,init)=>{const response=await fetch(input,init);if(String(input).endsWith('/api/plans/'+PLAN)){if(replay)return new Response(JSON.stringify(old),{headers:{'content-type':'application/json'}});if(response.ok)old=await response.clone().json();}return response;};
 try{
  await write('jules','join',{planId:PLAN});await write('ada','accept',{planId:PLAN,requesterId:'jules'});await write('jules','grant',{planId:PLAN,otherId:'ada'});await write('ada','grant',{planId:PLAN,otherId:'jules'});
  const client=createMobileClient(createLocalPrototypePort({url,personId:'jules',token:jules.token,fetcher}));await client.boot();await client.reviewPlan(PLAN);await client.refresh();assert.equal(client.heldRelay(),'relay:ada.linden');
  const block=await write('ada','block',{otherId:'jules'},'durable-block');await client.refresh();assert.equal(client.heldRelay(),null);assert.equal((client as any).highWater.get(`plan:${PLAN}:jules`),block.version);
  await server.close();await world.close();world=createWorld({databasePath});server=createHttp(world);await server.listen(port);
  replay=true;await client.foregroundRefresh();assert.equal(client.heldRelay(),null);assert.equal(client.screen().relay.value,null);
  replay=false;await client.refresh();assert.equal(client.heldRelay(),null);assert.equal((client as any).highWater.get(`plan:${PLAN}:jules`),block.version);
  assert.deepEqual(await write('ada','block',{otherId:'jules'},'durable-block'),block);
  const fresh=createMobileClient(createLocalPrototypePort({url,personId:'jules',token:jules.token}));await fresh.boot();await fresh.reviewPlan(PLAN);assert.equal(fresh.heldRelay(),null);assert.equal((fresh as any).deniedThrough.get(`plan:${PLAN}:jules`),block.version);
 }finally{await server.close();await world.close();}
});
