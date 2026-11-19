// Actual web recovery UI and cached AuthClient. Only provider delivery is synthetic.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),PREFIX='verification/web/evidence/email-recovery';
const sha=value=>createHash('sha256').update(value).digest('hex');
function read(name){const file=path.isAbsolute(name)?name:path.join(ROOT,name),s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Nonmaterialized input');return fs.readFileSync(file);}
const provider='https://email-recovery-provider.test',key='sb_publishable_NONISSUED_WEB_RECOVERY_SESSION';
const subject='78111111-1111-4111-8111-111111111111',other='78222222-2222-4222-8222-222222222222';
const email='RECOVERY_PRIVATE_EMAIL@example.invalid',password='RECOVERY_PRIVATE_PASSWORD_42',code='RECOVERY_PRIVATE_CODE_42';
const recoveryToken=(method='recovery',ttl=3600)=>{const now=Math.floor(Date.now()/1000);return Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:subject,exp:now+ttl,amr:[{method,timestamp:now}]})).toString('base64url')+'.NONISSUED_SIGNATURE';};
const access=recoveryToken(),refresh='RECOVERY_PRIVATE_REFRESH_TOKEN';
const secrets=new Set([email,password,code,access,refresh]);
const redact=value=>{let text=String(value);for(const secret of secrets)if(secret)text=text.split(secret).join('[redacted]');return text.replace(/(?:code|flow)=[^&\s"']+/g,'[redacted-callback]');};
const filename=PREFIX+'-browser.json',startedAt=new Date().toISOString();
let priorReceipt=null;
if(fs.existsSync(path.join(ROOT,filename))){const bytes=read(filename),archive=PREFIX+'-prior-'+Date.now()+'.json';fs.writeFileSync(path.join(ROOT,archive),bytes);priorReceipt={path:archive,sha256:sha(bytes),status:JSON.parse(bytes).status};}
const result={status:'RUNNING',startedAt,stories:[],http:[],errors:[],sourceHashes:{},runtimeHashes:{},evidenceHashes:{},priorReceipt,cleanup:{browser:'pending',server:'pending'},
 scope:'Actual Recovery React component, emailRecovery controller and cached AuthClient2.99.3 in real Chromium, with actual local HTTP document/JS/CSS delivery. Canonical globals and recovery CSS execute, without Next/PostCSS or bundled font acceptance. Strict synthetic HTTPS provider responses exercise the cached SDK; no remote provider or issued credentials. Native SDK/device, actual email delivery/templates/expiry, production session cookies, deployment redirect policy and full Next server routing are outside this proof. NextLink, if used, is an ordinary anchor. Captured handlers are real installed React callbacks.'};
const write=()=>{const text=JSON.stringify(result,null,2)+'\n';for(const secret of secrets)assert(!text.includes(secret),'Private sentinel reached evidence');fs.writeFileSync(path.join(ROOT,filename),text);};
const pass=name=>{result.stories.push(name);write();console.log('PASS '+result.stories.length+': '+name);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(fn,ms=5000){let timer;try{return await Promise.race([fn(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Bounded fixture wait expired')),ms))]);}finally{clearTimeout(timer);}}
let browser,context,page,server,origin,held=null,holdNext=null,nextStatus=200,mismatch=false,expired=false,wrongPurpose=false,dropUpdate=false,updated=0;
const fixtureSecrets={email,password,code,access,refresh};
const gates=new Set();
write();
try{
 assert(process.execArgv.some(arg=>arg.endsWith('/deny-build-network.cjs')),'Startup guard required');
 const bundle=read(PREFIX+'-fixture/page.js'),css=read(PREFIX+'-fixture/page.css'),manifest=JSON.parse(read(PREFIX+'-fixture/source-manifest.json'));
 Object.assign(result.sourceHashes,manifest.sourceHashes);Object.assign(result.runtimeHashes,manifest.runtimeHashes);
 for(const name of ['verification/web/tests/browser-email-recovery.mjs','verification/web/scripts/deny-build-network.cjs'])result.sourceHashes[name]=sha(read(name));
 for(const name of ['page.js','page.css','source-manifest.json'])result.evidenceHashes[PREFIX+'-fixture/'+name]=sha(read(PREFIX+'-fixture/'+name));
 const playwrightRoot='/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/';
 const require=createRequire(playwrightRoot+'playwright/package.json');
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
 for(const file of [process.execPath,executablePath,...['playwright/package.json','playwright/index.js','playwright-core/package.json','playwright-core/index.js','playwright-core/browsers.json','playwright-core/lib/bootstrap.js','playwright-core/lib/coreBundle.js','playwright-core/lib/utilsBundle.js'].map(name=>playwrightRoot+name)])result.runtimeHashes[file]=sha(read(file));
 for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes}))assert.equal(sha(read(n)),h,'Changed pre-run input');
 const html='<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><body style="margin:0;background:#101d1a;color:#eee;font-family:system-ui"><div id="root"></div><script type="module" src="/page.js"></script></body></html>';
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(req.method!=='GET'||req.headers.cookie){res.statusCode=400;res.end();return;}
  const body=url.pathname==='/auth/recovery'?html:url.pathname==='/page.js'?bundle:url.pathname==='/page.css'?css:url.pathname==='/login'?'<h1>Normal sign-in destination</h1>':null;
  if(body===null){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html');res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await require('playwright').chromium.launch({headless:true,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 context=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block',acceptDownloads:false});
 await context.addInitScript(({values})=>{
  const probe={online:true,broadcasts:0,secretWrites:0,events:new Map()};Object.assign(window,{recoveryProbe:probe});
  Object.defineProperty(navigator,'onLine',{get:()=>probe.online,configurable:true});
  const originalSet=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(Object.values(values).some(value=>String(v).includes(value))||/"(?:access_token|refresh_token)"/.test(String(v)))probe.secretWrites++;return originalSet.call(this,k,v);};
  const Original=window.BroadcastChannel;
  window.BroadcastChannel=class extends Original{postMessage(value){probe.broadcasts++;return super.postMessage(value);}};
  for(const target of [window,document]){
   const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);
   target.addEventListener=(name,fn,options)=>{if(['blur','focus','online','offline','visibilitychange'].includes(name)){let set=probe.events.get(name);if(!set){set=new Set();probe.events.set(name,set);}set.add(fn);}return add(name,fn,options);};
   target.removeEventListener=(name,fn,options)=>{probe.events.get(name)?.delete(fn);return remove(name,fn,options);};
  }
 },{values:fixtureSecrets});
 page=await context.newPage();page.setDefaultTimeout(6000);
 page.on('pageerror',error=>result.errors.push(redact(error.stack||error)));
 page.on('console',message=>{if(Object.values(fixtureSecrets).some(value=>message.text().includes(value)))result.errors.push('Private sentinel reached browser console');});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  try{
   if(url.origin===origin){assert(['/auth/recovery','/page.js','/page.css','/login'].includes(url.pathname),'Unexpected application endpoint');await route.continue();return;}
   assert.equal(url.origin,provider,'Unexpected external origin');
   const headers=await request.allHeaders();assert.equal(headers.cookie,undefined,'Provider cookie');assert.equal(headers.referer,undefined,'Provider referrer');
   const cors={'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,OPTIONS','content-type':'application/json','cache-control':'no-store'};
   if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
   assert.equal(headers.apikey,key,'Configured public key');
   const method=request.method(),input=request.postData()?JSON.parse(request.postData()):null;
   if(input)for(const value of Object.values(input))if(typeof value==='string')secrets.add(value);
   let body,status=nextStatus;nextStatus=200;
   const user=()=>({id:mismatch?other:subject,aud:'authenticated',role:'authenticated',email,user_metadata:{},app_metadata:{provider:'email'},created_at:'2026-01-01T00:00:00Z'});
   if(url.pathname==='/auth/v1/recover'){
    assert.equal(method,'POST');assert.equal(input.email,email,'Expected synthetic email');assert.equal(input.code_challenge_method,'s256');assert.match(input.code_challenge,/^[A-Za-z0-9_-]{43}$/);assert.equal(headers.authorization,'Bearer '+key);
    const redirect=new URL(url.searchParams.get('redirect_to'));assert.equal(redirect.origin,origin);assert.equal(redirect.pathname,'/auth/recovery');assert.match(redirect.searchParams.get('flow'),/^[0-9a-f]{64}$/);secrets.add(redirect.searchParams.get('flow'));body={};
   }else if(url.pathname==='/auth/v1/token'){
    assert.equal(method,'POST');assert.equal(url.search,'?grant_type=pkce');assert.equal(input.auth_code,code,'Expected synthetic code');assert.equal(typeof input.code_verifier,'string');assert.equal(headers.authorization,'Bearer '+key);
    const returnedToken=wrongPurpose?recoveryToken('oauth'):expired?recoveryToken('recovery',60):access;secrets.add(returnedToken);
    body={access_token:returnedToken,refresh_token:refresh,token_type:'bearer',expires_in:expired?60:3600,user:{...user(),id:subject}};
   }else if(url.pathname==='/auth/v1/user'){
    assert.equal(url.search,'');assert.equal(headers.authorization,'Bearer '+access,'Exact recovery token');assert(['GET','PUT'].includes(method));
    if(method==='PUT'){assert.deepEqual(Object.keys(input).sort(),['code_challenge','code_challenge_method','password']);assert.equal(input.code_challenge,null);assert.equal(input.code_challenge_method,null);assert.equal(input.password,password,'Expected synthetic password');updated++;}
    body=user();
   }else throw Error('Unexpected provider endpoint');
   if(status!==200)body={code:status===429?'over_email_send_rate_limit':'invalid_credentials',msg:'Synthetic provider refusal'};
   const entry={path:url.pathname,method,status,bodyKeys:input?Object.keys(input).sort():[]};result.http.push(entry);
   if(holdNext===method+' '+url.pathname){holdNext=null;let release;const promise=new Promise(resolve=>{release=resolve;});held={release,done:false};gates.add(held);const gate=held;await promise;gate.done=true;gates.delete(gate);}
   if(dropUpdate&&method==='PUT'){dropUpdate=false;await route.abort();return;}
   try{await route.fulfill({status,headers:cors,body:JSON.stringify(body)});}catch(error){if(!request.failure())throw error;}
  }catch(error){result.errors.push(redact(error.stack||error));try{await route.abort();}catch{}}
 });
 const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByLabel(name,{exact:true});
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const enabled=name=>page.waitForFunction(name=>[...document.querySelectorAll('button')].some(button=>button.textContent===name&&!button.disabled),name);
 const retain=(locator,event='onClick')=>locator.evaluate((node,event)=>window.recoveryQa.retain(node,event),event);
 const invoke=(id,value='')=>page.evaluate(([id,value])=>window.recoveryQa.invoke(id,value),[id,value]);
 async function storage(){const entries=await page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage)),probe:{broadcasts:window.recoveryProbe.broadcasts,secretWrites:window.recoveryProbe.secretWrites}}));
  assert.deepEqual(entries.session,{});assert.equal(entries.probe.broadcasts,0);assert.equal(entries.probe.secretWrites,0);assert.equal((await context.cookies()).length,0);
  assert(Object.keys(entries.local).every(key=>key==='soe.email-recovery.v1'),'Ordinary token storage key');
  if(entries.local['soe.email-recovery.v1']){const record=JSON.parse(entries.local['soe.email-recovery.v1']);assert.deepEqual(Object.keys(record).sort(),['createdAt','expiresAt','flow','verifier','version']);assert(!JSON.stringify(record).includes(email));return record;}return null;
 }
 async function fresh(){for(const gate of gates)gate.release();held=null;holdNext=null;mismatch=false;expired=false;wrongPurpose=false;nextStatus=200;dropUpdate=false;await page.goto(origin+'/auth/recovery');await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();window.recoveryQa.show();});await field('Email').waitFor();await settle();}
 async function send(){await field('Email').fill(email);await button('Send recovery email').click();await enabled('Send recovery email');const record=await storage();assert(record);return record;}
 async function callback(record,query=''){await page.goto(origin+'/auth/recovery?flow='+record.flow+'&code='+code+query);await settle();assert.equal(new URL(page.url()).search,'');assert.equal(new URL(page.url()).hash,'');}
 async function verify(){await button('Continue recovery').click();await field('New password').waitFor();await enabled('Update password');}
 const fillPassword=async()=>{await field('New password').fill(password);await field('Confirm new password').fill(password);};
 const waitHeld=()=>bounded(async()=>{while(!held)await sleep(10);});
 const release=async()=>{const gate=held;assert(gate);gate.release();await bounded(async()=>{while(!gate.done)await sleep(10);});held=null;await settle();};
 await fresh();let at=result.http.length;await settle();assert.equal(result.http.length,at);assert.equal(await storage(),null);
 pass('recovery mount is inert and has no ordinary session, provider selection or member API');
 const first=await send();assert.equal(result.http.length,at+1);assert.equal(result.http.at(-1).path,'/auth/v1/recover');
 pass('explicit email request sends only a bounded PKCE recovery request and persists only the expiring verifier record');
 await field('Email').fill(email);holdNext='POST /auth/v1/recover';const sendHandler=await retain(button('Send recovery email'));await invoke(sendHandler);await waitHeld();at=result.http.length;await invoke(sendHandler);await settle();assert.equal(result.http.length,at);await release();await enabled('Send recovery email');const replaced=await storage();assert.notEqual(replaced.flow,first.flow);
 pass('explicit resend replaces the previous flow; a duplicate captured request callback cannot send twice while busy');
 await callback(first);at=result.http.length;await button('Continue recovery').click();await enabled('Send recovery email');assert.equal(await button('Continue recovery').count(),0);assert.equal(result.http.length,at);assert.equal((await storage())?.flow,replaced.flow);
 pass('an older callback cannot claim a replacement recovery flow and sends no exchange');
 await fresh();nextStatus=429;await field('Email').fill(email);await button('Send recovery email').click();await enabled('Send recovery email');at=result.http.length;await settle();assert.equal(result.http.length,at);await storage();assert.equal(await field('New password').count(),0);
 pass('provider rate refusal produces no automatic resend or recovery session; durable storage contains only the pending verifier');
 await fresh();holdNext='POST /auth/v1/recover';await field('Email').fill(email);await button('Send recovery email').click();await waitHeld();await enabled('Send recovery email');at=result.http.length;await release();await settle();assert.equal(result.http.length,at);await storage();assert.equal(await field('New password').count(),0);
 pass('lost email acknowledgement times out without automatic retry; a late reply creates no recovery session and only the pending verifier may remain');
 await fresh();const purpose=await send();await callback(purpose,'&type=signup');at=result.http.length;assert.equal(await button('Continue recovery').count(),0);assert.equal(result.http.length,at);
 pass('a callback claiming a different purpose is scrubbed and refused without exchange');
 await fresh();const oldRecord=await send();await page.evaluate(()=>{const record=JSON.parse(localStorage.getItem('soe.email-recovery.v1'));record.createdAt=Date.now()-7200000;record.expiresAt=record.createdAt+3600000;localStorage.setItem('soe.email-recovery.v1',JSON.stringify(record));});await callback(oldRecord);at=result.http.length;await button('Continue recovery').click();await enabled('Send recovery email');assert.equal(await button('Continue recovery').count(),0);assert.equal(result.http.length,at);await storage();
 pass('an expired local verifier cannot be restored or exchanged after reload');
 await fresh();const consumed=await send();await callback(consumed);nextStatus=400;at=result.http.length;await button('Continue recovery').click();await enabled('Send recovery email');assert.equal(await field('New password').count(),0);assert.equal(await storage(),null);assert.equal(result.http.slice(at).length,1);
 pass('an expired or consumed provider code is claimed only once and cannot automatically replay its exchange');
 await fresh();const concurrent=await send();await callback(concurrent);const second=await context.newPage();second.on('pageerror',error=>result.errors.push(redact(error.stack||error)));await second.goto(origin+'/auth/recovery?flow='+concurrent.flow+'&code='+code);await second.getByRole('button',{name:'Continue recovery',exact:true}).waitFor();
 holdNext='POST /auth/v1/token';await button('Continue recovery').click();await waitHeld();at=result.http.length;await second.getByRole('button',{name:'Continue recovery',exact:true}).click();await second.getByLabel('Email',{exact:true}).waitFor();await settle();assert.equal(result.http.length,at);assert.equal(await storage(),null);await release();await field('New password').waitFor();await second.close();
 pass('two real tabs share one verifier under Web Locks; only one explicit continuation can reach the SDK exchange');
 await fresh();const pending=await send();at=result.http.length;await callback(pending);assert.equal(result.http.length,at);assert.equal((await storage())?.flow,pending.flow);await verify();assert.equal(await storage(),null);assert.deepEqual(result.http.slice(at).map(r=>[r.method,r.path]),[['POST','/auth/v1/token'],['GET','/auth/v1/user']]);
 pass('callback code is scrubbed before explicit continuation; actual SDK exchange and exact-token subject proof remain memory-only');
 await page.screenshot({path:path.join(ROOT,PREFIX+'-320.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await fillPassword();const preEdit=await retain(button('Update password'));await field('Confirm new password').fill('Synthetic different draft');at=result.http.length;await invoke(preEdit);await settle();assert.equal(result.http.length,at);await fillPassword();
 pass('editing the reviewed password fields retires a captured earlier update callback');
 at=result.http.length;await button('Update password').click();await page.getByText('Password update accepted. Sign in with your new password.',{exact:true}).waitFor();await settle();assert.equal(result.http.slice(at).filter(r=>r.method==='PUT').length,1);assert.equal(await field('New password').count(),0);await storage();
 pass('password update is explicit, password-only and owner-checked; completion clears fields and offers ordinary sign-in without provisioning');
 await fresh();const wrong=await send();await callback(wrong);mismatch=true;await button('Continue recovery').click();await enabled('Send recovery email');assert.equal(await field('New password').count(),0);await storage();
 pass('a different fresh exact-token subject refuses recovery before any password control or update');
 await fresh();const wrongMethod=await send();await callback(wrongMethod);wrongPurpose=true;at=result.http.length;await button('Continue recovery').click();await enabled('Send recovery email');assert.equal(await field('New password').count(),0);assert.deepEqual(result.http.slice(at).map(r=>r.path),['/auth/v1/token']);await storage();
 pass('an exchanged token with ordinary OAuth AMR is refused before user verification or password update');
 await fresh();const exp=await send();await callback(exp);expired=true;at=result.http.length;await button('Continue recovery').click();await enabled('Send recovery email');assert.equal(await field('New password').count(),0);assert.equal(result.http.slice(at).some(r=>r.method==='PUT'),false);await storage();
 pass('near-expired recovery credentials are refused without refresh or password update');
 await fresh();const lost=await send();await callback(lost);await verify();await fillPassword();const oldUpdate=await retain(button('Update password'));dropUpdate=true;at=result.http.length;const before=updated;await button('Update password').click();await enabled('Send recovery email');await settle();assert.equal(updated,before+1);assert.equal(result.http.slice(at).filter(r=>r.method==='PUT').length,1);assert.match(await page.locator('body').innerText(),/may|uncertain|not.*confirm/i);const afterLost=result.http.length;await invoke(oldUpdate);await settle();assert.equal(result.http.length,afterLost);await storage();
 pass('a lost password-update receipt stays uncertain, clears the capability and password, and an old handler cannot replay it or settle it with a user GET');
 await fresh();const lifecycle=await send();await callback(lifecycle);await verify();await fillPassword();const oldChange=await retain(field('New password'),'onChange'),oldSubmit=await retain(button('Update password'));at=result.http.length;
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await settle();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await settle();await invoke(oldChange,password);await invoke(oldSubmit);await settle();assert.equal(result.http.length,at);assert.equal(await field('New password').count(),0);await storage();
 pass('blur retires the recovery capability and captured password/change callbacks; focus sends nothing');
 await fresh();const offline=await send();await callback(offline);holdNext='POST /auth/v1/token';await button('Continue recovery').click();await waitHeld();await page.evaluate(()=>{window.recoveryProbe.online=false;window.dispatchEvent(new Event('offline'));});await settle();await release();await page.evaluate(()=>{window.recoveryProbe.online=true;window.dispatchEvent(new Event('online'));});await settle();assert.equal(await field('New password').count(),0);await storage();
 pass('late code exchange after offline retirement cannot expose password entry or ordinary authentication on reconnect');
 await fresh();const malformed=await send();await callback(malformed,'&code=duplicate');at=result.http.length;assert.equal(await button('Continue recovery').count(),0);assert.equal(result.http.length,at);assert.equal(new URL(page.url()).search,'');
 pass('duplicate callback parameters are scrubbed and refused without SDK exchange');
 await fresh();const final=await send();await callback(final);await verify();await fillPassword();await button('Update password').click();await page.getByText('Password update accepted. Sign in with your new password.',{exact:true}).waitFor();const loginLink=page.getByRole('link',{name:/sign in/i});await loginLink.waitFor();assert.equal(new URL(await loginLink.getAttribute('href'),origin).pathname,'/login');assert.equal(new URL(await loginLink.getAttribute('href'),origin).search,'?recovery=1');await loginLink.click();await page.getByRole('heading',{name:'Normal sign-in destination'}).waitFor();assert.equal((await context.cookies()).length,0);
 pass('completion returns to the normal login route through an explicit link and creates no ordinary browser session');
 assert.deepEqual(result.errors,[]);result.status='PASS';
}catch(error){result.status='FAIL';result.failure=redact(error.stack||error);process.exitCode=1;}
finally{
 for(const gate of gates)gate.release();
 if(page){await page.evaluate(()=>window.recoveryQa?.unmount()).catch(()=>{});result.remainingListeners=await page.evaluate(()=>window.recoveryProbe?[...window.recoveryProbe.events.values()].reduce((sum,set)=>sum+set.size,0):0).catch(()=>null);}
 if(browser){await browser.close();result.cleanup.browser='closed';}
 if(server){await new Promise(resolve=>server.close(resolve));result.cleanup.server='closed';}
 try{for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes,...result.evidenceHashes}))assert.equal(sha(read(n)),h,'Input changed during proof');}catch(error){result.status='FAIL';result.failure??=redact(error.stack||error);process.exitCode=1;}
 result.completedAt=new Date().toISOString();if(fs.existsSync(path.join(ROOT,PREFIX+'-320.png')))result.screenshot={path:PREFIX+'-320.png',sha256:sha(read(PREFIX+'-320.png'))};write();
}
if(result.status!=='PASS')throw Error(result.failure||'Recovery proof failed');
console.log('PASS web email recovery: '+result.stories.length+' stories; '+result.http.length+' synthetic provider requests.');
