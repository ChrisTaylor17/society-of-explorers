import 'next/dist/server/node-environment.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:https';
import {resolve} from 'node:path';
import {Wallet} from 'ethers';
import {SiweMessage} from 'siwe';
import next from 'next';
import {NextRequest,NextResponse} from 'next/server.js';

const [work,...extra]=process.argv.slice(2);
assert(!extra.length&&/^\/private\/tmp\/soe-webkit-admission[.][A-Za-z0-9_]+$/.test(work??''));
assert.equal(process.env.NODE_ENV,'production');assert(globalThis.__soeBuiltShellGuard);
const port=Number(process.env.SOE_BUILT_SHELL_PORT);assert(Number.isInteger(port)&&port>=1024&&port<=65535);
const root=process.cwd(),origin='https://127.0.0.1:'+port,buildId=readFileSync('.next/BUILD_ID','utf8').trim();
process.chdir(resolve(root,'verification/web'));
const {offlineApp}=await import('../tests/support/offline-app.mjs');
const {createPublicProfileApp,ORIGIN}=await import('../tests/support/public-profile-app.mjs');
const catalog=await createPublicProfileApp({admission:true});
const actors={host:{memberId:catalog.actors.author,wallet:Wallet.createRandom()},
 recipient:{memberId:catalog.actors.outsider,wallet:Wallet.createRandom()},forwarded:{memberId:catalog.actors.other,wallet:Wallet.createRandom()}};
for(const[name,actor]of Object.entries(actors))await catalog.db.query('UPDATE public.members SET wallet_address=$1,display_name=$2 WHERE id=$3',
 [actor.wallet.address.toLowerCase(),'Synthetic WebKit '+name,actor.memberId]);
for(const name of ['wallet-challenge-consumption','wallet-session-revocation'])await catalog.db.exec(readFileSync(resolve(root,'docs/sql',name+'-apply.sql'),'utf8'));
const auth=offlineApp({root}),db=auth.fakes.resetDb({members:Object.entries(actors).map(([name,a])=>({id:a.memberId,display_name:'Synthetic WebKit '+name,wallet_address:a.wallet.address.toLowerCase()}))});
db.strictSingle=true;auth.context.process.env.NODE_ENV='production';
auth.context.process.env.WALLET_SESSION_SECRET=catalog.app.context.process.env.WALLET_SESSION_SECRET;
const walletArgs={soe_wallet_challenge_consume:['p_digest','p_expires_at'],soe_wallet_session_access:['p_digest','p_expires_at','p_revoke']};
db.rpc=(name,args)=>({async abortSignal(signal){
 signal.throwIfAborted();assert(Object.hasOwn(walletArgs,name));const keys=walletArgs[name];assert.deepEqual(Object.keys(args).sort(),[...keys].sort());
 return catalog.db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE service_role');
  const sql='SELECT public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') AS result';
  return{data:(await tx.query(sql,keys.map(k=>args[k]))).rows[0].result,error:null};});
}});
auth.setMock('next/server',()=>({NextResponse}));
auth.setMock('@/lib/supabase/server',()=>({createServiceClient:()=>db}));
auth.setMock('@/lib/supabase/admin',()=>({getSupabaseAdmin:()=>db}));
const walletStore=auth.load('lib/auth/walletSessionStore.ts');
auth.setMock('@/lib/auth/walletSessionStore',()=>walletStore);
catalog.app.setMock('@/lib/auth/walletSessionStore',()=>walletStore);
const authRoutes=new Map([['GET /api/auth/nonce',auth.load('app/api/auth/nonce/route.ts').GET],
 ['POST /api/auth/siwe',auth.load('app/api/auth/siwe/route.ts').POST],['POST /api/auth/logout',auth.load('app/api/auth/logout/route.ts').POST]]);
const hostHeaders={authorization:'Bearer '+catalog.TOKENS.author,origin:ORIGIN,'x-soe-expected-member':actors.host.memberId};
const created=await catalog.dispatch('/api/circles',{method:'POST',headers:hostHeaders,
 body:await catalog.createBody({expectedMemberId:actors.host.memberId,title:'WebKit approval salon',format:'online',city:null,region:null,
  venueName:null,venueType:'online',onlineUrl:'https://fixture.invalid/PRIVATE_SYNTHETIC_MEETING',admissionMode:'host_approval'})});
const creation=await created.json();assert.equal(created.status,200,JSON.stringify(creation));const circleId=creation.circleId;
process.chdir(root);
const app=next({dev:false,dir:root,hostname:'127.0.0.1',port,quiet:true});await app.prepare();const handle=app.getRequestHandler();
const requests=[],failures=[],signatures=[];let loseJoin=false,loseRevoke=false,closed=false;
const hash=body=>createHash('sha256').update(body??'').digest('hex');
async function readBody(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;assert(size<=8192);chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
const server=createServer({key:readFileSync(resolve(work,'fixture.key')),cert:readFileSync(resolve(work,'fixture.pem'))},async(req,res)=>{
 try{
  assert(req.url.startsWith('/')&&!req.url.startsWith('//'));const url=new URL(req.url,origin);
  assert.equal(url.origin,origin);assert.equal(req.headers.host,url.host);const key=req.method+' '+url.pathname;let reply,body;
  if(key==='POST /__fixture/wallet-sign'){
   assert.equal(req.headers.origin,origin);body=await readBody(req);const parsed=new SiweMessage(body);
   assert.equal(parsed.uri,origin);assert.equal(parsed.domain,url.host);const entry=Object.entries(actors).find(([,v])=>v.wallet.address===parsed.address);assert(entry);
   signatures.push(entry[0]);reply=Response.json({signature:await entry[1].wallet.signMessage(body)});
  }else if(key==='POST /__fixture/loss'){
   assert.equal(req.headers.origin,origin);body=await readBody(req);assert(['join','revoke'].includes(body));
   if(body==='join')loseJoin=true;else loseRevoke=true;reply=Response.json({configured:true});
  }else if(key==='GET /__fixture/state'){
   reply=Response.json({requests:requests.filter(v=>v.path.endsWith('/join-invited')||v.path.endsWith('/invitation-receipt')||v.path.endsWith('/invitations/revoke'))});
  }else if(authRoutes.has(key)){
   assert(!req.headers.authorization);body=req.method==='POST'?await readBody(req):undefined;
   reply=await authRoutes.get(key)(new NextRequest(url,{method:req.method,headers:req.headers,body}));
  }else if(url.pathname==='/api/auth/member'||url.pathname==='/api/circles/'+circleId
    ||new RegExp('^/api/circles/'+circleId+'/(admission-access|recipient-code|invitation-review|invitations|invitation-check|join-invited|invitation-receipt|invitations/revoke)$').test(url.pathname)){
   assert(!req.headers.authorization);const headers=new Headers(req.headers);if(headers.has('origin')){assert.equal(headers.get('origin'),origin);headers.set('origin',ORIGIN);}
   body=req.method==='POST'?await readBody(req):undefined;reply=await catalog.dispatch(url.pathname+url.search,{method:req.method,headers,body});
   if(reply.status===200&&(loseJoin&&url.pathname.endsWith('/join-invited')||loseRevoke&&url.pathname.endsWith('/invitations/revoke'))){
    if(url.pathname.endsWith('/join-invited'))loseJoin=false;else loseRevoke=false;
    reply=Response.json({error:'Synthetic post-commit reply loss',outcome:'unknown'},{status:503});
   }
  }else{
   assert(!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/__fixture/'),'Unexpected fixture path');
   await handle(req,res);return;
  }
  requests.push({path:url.pathname,method:req.method,status:reply.status,bodySha256:hash(body),keys:body?.startsWith('{')?Object.keys(JSON.parse(body)):[]});
  const headers=Object.fromEntries(reply.headers),cookies=reply.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
  res.writeHead(reply.status,headers);res.end(await reply.text());
 }catch(error){failures.push(String(error.message));if(!res.headersSent)res.writeHead(500,{'content-type':'text/plain'});res.end('Local fixture refused request');}
});
await new Promise((done,fail)=>server.once('error',fail).listen(port,'127.0.0.1',done));
writeFileSync(resolve(work,'fixture-ready.json'),JSON.stringify({buildId,origin,circleId,pid:process.pid,
 actors:Object.fromEntries(Object.entries(actors).map(([name,v])=>[name,{memberId:v.memberId,walletAddress:v.wallet.address}]))})+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'READY',origin,buildId}));
process.once('SIGTERM',async()=>{
 if(closed)return;closed=true;
 try{
  const waiting=new Promise(done=>server.close(done));server.closeIdleConnections();await waiting;
  const members=(await catalog.db.query('SELECT member_id FROM book_cohort_members WHERE cohort_id=$1 ORDER BY member_id',[circleId])).rows.map(r=>r.member_id);
  const revision=(await catalog.db.query('SELECT circle_invitation_revision FROM book_cohorts WHERE id=$1',[circleId])).rows[0].circle_invitation_revision;
  const usedChallenges=(await catalog.db.query('SELECT count(*)::int n FROM soe_wallet_private.used_challenges')).rows[0].n;
  const revokedSessions=(await catalog.db.query('SELECT count(*)::int n FROM soe_wallet_private.revoked_sessions')).rows[0].n;
  await catalog.close();await app.close();
  const report={status:'STOPPED',buildId,signatures,requests,failures,members,invitationRevision:revision,usedChallenges,revokedSessions,
   denied:globalThis.__soeBuiltShellGuard.denied,scope:'Compiled frontend and real source route/auth handlers over disposable SQL and local PostgREST/provider adapters; no deployed middleware or hosted provider acceptance.'};
  writeFileSync(resolve(work,'fixture-stopped.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  process.exit(failures.length||report.denied.length?1:0);
 }catch(error){writeFileSync(resolve(work,'fixture-stop-error.json'),JSON.stringify({error:String(error.stack??error)})+'\n');process.exit(1);}
});
