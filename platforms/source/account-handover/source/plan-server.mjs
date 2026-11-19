import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createWorld} from '../corrected-backend/prototypes/soe-join-revoke/src/world.js';
import {createHttp} from '../corrected-backend/prototypes/soe-join-revoke/src/http.js';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
export async function startPlanFixture({databasePath,messages=false}={}) {
  const manifestBytes=await readFile(join(ROOT,'CANDIDATE_SHA256.json')),manifest=JSON.parse(manifestBytes);
  for(const [path,expected]of Object.entries(manifest))assert.equal(createHash('sha256').update(await readFile(join(ROOT,path))).digest('hex'),expected,path);
  const runtime=join(ROOT,'.runtime');await mkdir(runtime,{recursive:true,mode:0o700});
  const owned=databasePath?null:await mkdtemp(join(runtime,'leave-'));
  let world,backend,server,origin,closed=false;
  try {
    world=createWorld({databasePath:databasePath??join(owned,'world.sqlite'),...(messages?{allowFaults:true,syntheticMessages:'plan-messages-v1'}:{})});backend=createHttp(world);
    const {url:backendOrigin}=await backend.listen(0);
    const files=new Set(['plan.html','plan.css','plan-app.mjs','plan-client.mjs','message-client.mjs','message-view.mjs','field-render.mjs']);
    const api=/^\/api\/(health|session|lookup|membership\/plan-riverside|plans(?:\/plan-riverside(?:\/(?:visibility|messaging-context|messages))?)?|writes\/(join|accept|grant|revoke|leave|block|report|message-consent|message-revoke|message-send))$/;
    server=createServer(async(req,res)=>{
      const send=(code,type,data)=>{res.writeHead(code,{'content-type':type+'; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(data);};
      try {
        if(req.headers.origin&&req.headers.origin!==origin)return send(403,'application/json',JSON.stringify({status:'rejected',error:'local_origin_only'}));
        const url=new URL(req.url,origin),name=url.pathname==='/'?'plan.html':url.pathname.slice(1);
        if(req.method==='GET'&&files.has(name))return send(200,name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',await readFile(join(ROOT,'source/public',name)));
        if(req.method==='GET'&&url.pathname==='/local-fixture.json')return send(200,'application/json',JSON.stringify({synthetic:true,localOnly:true,contract:'leave-plan-v1',storage:'sqlite',messaging:messages?await world.messagingIdentity():false,sourceManifestSHA256:createHash('sha256').update(manifestBytes).digest('hex')}));
        if(['GET','POST'].includes(req.method)&&api.test(url.pathname)) {
          const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)return send(413,'application/json',JSON.stringify({status:'rejected',error:'too_large'}));chunks.push(chunk);}
          const r=await fetch(backendOrigin+url.pathname+url.search,{method:req.method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{accept:'application/json',...(req.headers.authorization?{authorization:req.headers.authorization}:{}),...(req.method==='POST'?{'content-type':'application/json'}:{})},...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
          return send(r.status,'application/json',await r.text());
        }
        send(404,'application/json',JSON.stringify({status:'unavailable',blocker:'No local consumer route.'}));
      }catch{send(500,'application/json',JSON.stringify({status:'unavailable',blocker:'Local fixture unavailable. No success is confirmed.'}));}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
    return {origin,world,async close(){if(closed)return;closed=true;try{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}finally{try{await backend.close();}finally{await world.close();if(owned)await rm(owned,{recursive:true});}}}};
  }catch(error){await new Promise(resolve=>server?server.close(resolve):resolve());await backend?.close();await world?.close();if(owned)await rm(owned,{recursive:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  // Explicit, candidate-owned durable workspace. Never adopt an arbitrary path.
  const runtime=join(ROOT,'.runtime');await mkdir(runtime,{recursive:true,mode:0o700});
  const f=await startPlanFixture({databasePath:join(runtime,process.argv.includes('--messages')?'messages-local.sqlite':'leave-local.sqlite'),messages:process.argv.includes('--messages')});
  console.log(JSON.stringify({origin:f.origin,synthetic:true,localOnly:true,contract:'leave-plan-v1',database:'candidate/.runtime/leave-local.sqlite'}));
  const close=async()=>{await f.close();process.exit(0);};process.once('SIGINT',close);process.once('SIGTERM',close);
}
