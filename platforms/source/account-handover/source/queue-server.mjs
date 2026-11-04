import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWorld } from '../corrected-backend/prototypes/soe-join-revoke/src/world.js';
import { createHttp } from '../corrected-backend/prototypes/soe-join-revoke/src/http.js';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
export async function startQueueFixture({contract=false,scenario='none',triage=true}={}) {
  if(contract!=='safety-queue-v1')throw Error('Disabled by default: explicit safety-queue-v1 contract required');
  if(!['A','B','none'].includes(scenario))throw Error('Unknown fictional scenario');
  const manifestBytes=await readFile(join(ROOT,'CANDIDATE_SHA256.json'));
  const manifest=JSON.parse(manifestBytes);
  for(const [path,sha] of Object.entries(manifest))assert.equal(createHash('sha256').update(await readFile(join(ROOT,path))).digest('hex'),sha,path);
  const runtime=join(ROOT,'.runtime');await mkdir(runtime,{recursive:true,mode:0o700});
  const owned=await mkdtemp(join(runtime,'queue-v1-'));
  let world,backend,server,origin,closed=false;
  try {
    world=createWorld({allowFaults:true,syntheticOps:true,privacyQueue:contract,databasePath:join(owned,'world.sqlite')});
    await world.seedSyntheticOpsFixture({marker:'TEST_ONLY',assignments:[
      {assignmentId:'A-L',personId:'jules',role:'lead',planId:'plan-riverside',epoch:7},
      {assignmentId:'A-S',personId:'mina',role:'safety',planId:'plan-riverside',epoch:3},
      ...(triage?[{assignmentId:'A-T',personId:'rhea',role:'safety_triage',planId:'plan-riverside',epoch:2}]:[]),
    ]});
    if(scenario!=='none'){
      const reporter=scenario==='A'?'ada':'mina',subject=scenario==='A'?'mina':'ada';
      const session=await world.signIn(reporter,'synthetic-'+reporter);
      const body={planId:'plan-riverside',otherId:subject,category:'other',details:'SYNTHETIC_QUEUE_PRIVATE_CANARY'};
      const {payloadHash}=await import('../corrected-backend/prototypes/soe-join-revoke/src/hash.js');
      assert.equal((await world.write(session.token,'report',{personId:reporter,idempotencyKey:'fixture-report',payloadHash:payloadHash(body),body})).status,'committed');
    }
    backend=createHttp(world);const {url:backendOrigin}=await backend.listen(0);
    const files=new Set(['queue.html','queue.css','queue-app.mjs','queue-client.mjs','queue-view.mjs','queue-fixture-contract.mjs']);
    const api=/^\/api\/(health|session|lookup|ops\/(state|triage|recipient)|plans(?:\/plan-riverside(?:\/visibility)?)?|writes\/(hold|hold-resolve|handoff-request|handoff-ack|assignment-revoke|safety-request|review-dispatch|review-escalate))$/;
    server=createServer(async(req,res)=>{
      const send=(code,type,data)=>{res.writeHead(code,{'content-type':type+'; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(data);};
      try{
        if(req.headers.origin&&req.headers.origin!==origin)return send(403,'application/json',JSON.stringify({status:'rejected',error:'local_origin_only'}));
        const url=new URL(req.url,origin),name=url.pathname==='/'?'queue.html':url.pathname.slice(1);
        if(req.method==='GET'&&files.has(name))return send(200,name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',await readFile(join(ROOT,'source/public',name)));
        if(req.method==='GET'&&url.pathname==='/local-fixture.json')return send(200,'application/json',JSON.stringify({synthetic:true,contract,localOnly:true,staffing:'UNASSIGNED',resumePolicyConfigured:false,backendSourceArchiveSHA256:'226a6184ab032ac3aaf30959968c304239b1f8fec9cd7db2263e2631181ecb27',candidateSourceManifestSHA256:createHash('sha256').update(manifestBytes).digest('hex')}));
        if(['GET','POST'].includes(req.method)&&api.test(url.pathname)){
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)return send(413,'application/json',JSON.stringify({status:'rejected',error:'too_large'}));chunks.push(chunk);}
          const response=await fetch(backendOrigin+url.pathname+url.search,{method:req.method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{accept:'application/json',...(req.headers.authorization?{authorization:req.headers.authorization}:{}),...(req.method==='POST'?{'content-type':'application/json'}:{})},...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
          return send(response.status,'application/json',await response.text());
        }
        send(404,'application/json',JSON.stringify({status:'unavailable',blocker:'No queue fixture route.'}));
      }catch{send(500,'application/json',JSON.stringify({status:'unavailable',blocker:'Queue fixture unavailable; no success confirmed.'}));}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
    return {origin,world,async close(){if(closed)return;closed=true;try{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}finally{try{await backend.close();}finally{await world.close();await rm(owned,{recursive:true});}}}};
  }catch(error){await new Promise(resolve=>server?server.close(resolve):resolve());try{await backend?.close();}catch{}finally{await world?.close();await rm(owned,{recursive:true});}throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(!process.argv.includes('--synthetic-queue-v1'))console.log('Disabled. Use --synthetic-queue-v1 for the fictional opt-in fixture.');
  else {const fixture=await startQueueFixture({contract:'safety-queue-v1',scenario:process.argv.includes('--scenario-a')?'A':process.argv.includes('--scenario-b')?'B':'none'});console.log(JSON.stringify({origin:fixture.origin,contract:'safety-queue-v1',synthetic:true,staffing:'UNASSIGNED'}));const close=async()=>{await fixture.close();process.exit(0);};process.once('SIGINT',close);process.once('SIGTERM',close);}
}
