import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),file='verification/web/evidence/native-account-setup-browser.json',sha=b=>createHash('sha256').update(b).digest('hex');
function read(name){const p=path.resolve(ROOT,name),s=fs.lstatSync(p);assert(!s.isSymbolicLink()&&s.isFile()&&(!s.size||s.blocks),'Refuse linked/offloaded source '+name);return fs.readFileSync(p);}
function runtime(p){const s=fs.statSync(p);assert(s.size&&s.blocks,'Refuse offloaded runtime');}
async function bounded(fn,ms=5000){let t;try{return await Promise.race([fn(),new Promise((_,no)=>t=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(t);}}
read('verification/web/tests/support/bearer-member-provisioning-app.mjs');
// The canonical HTTP loader resolves its cached runtime from verification/web.
process.chdir(path.join(ROOT,'verification/web'));
const {createProvisioningApp,IDS,TOKEN,ORIGIN,provisioningHashes}=await import('../../verification/web/tests/support/bearer-member-provisioning-app.mjs');
const priorReceipt=fs.existsSync(path.join(ROOT,file))?{sha256:sha(read(file)),receipt:JSON.parse(read(file))}:null,startedAt=new Date().toISOString(),stories=[],errors=[],unexpected=[],http=[],cleanup={browser:'pending',database:'pending'};
let sourceHashes={},bundle,browser,page,fixture,failure=null,losePost=false,wrongGet=false,stats;
function write(status){fs.writeFileSync(path.join(ROOT,file),JSON.stringify({status,startedAt,completedAt:new Date().toISOString(),stories,errors,unexpected,http,cleanup,sourceHashes,bundleSHA256:bundle?sha(bundle):null,stats,priorReceipt,failure,
 scope:'Actual native MemberCircleScreen/owner/account controller to canonical member GET/setup POST handlers and actual identity uniqueness SQL in disposable PGlite. Provider identity/delivery and React Native DOM primitives/AppState/connectivity are explicit synthetic doubles. The post-gate Circle conversation is a synthetic DTO used only to prove entry and privacy retirement. No real sign-in, issued credential, native compilation/Hermes/Codegen/OS storage/networking, production SQL or physical device acceptance.'},null,2)+'\n');}
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};write('RUNNING');
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')),'Startup guard required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');runtime(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';runtime(executablePath);
 bundle=read('verification/web/evidence/native-account-setup-fixture/page.js');
 sourceHashes={...JSON.parse(read('verification/web/evidence/native-account-setup-fixture/source-manifest.json')).sourceHashes,...await provisioningHashes(['platforms/tests/browser-native-account-setup.mjs'])};
 for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Rebundle changed source '+n);
 fixture=await createProvisioningApp();
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:800}});page=await context.newPage();const p=page;p.setDefaultTimeout(6000);
 p.on('pageerror',e=>errors.push(e.stack||String(e)));p.on('console',m=>{if(m.type()==='error'&&!/^Failed to load resource: the server responded with a status of (401|403|409|503)/.test(m.text()))errors.push(m.text());});
 await context.route('**/*',async route=>{try{
  const req=route.request(),u=new URL(req.url());if(u.origin!==ORIGIN){unexpected.push(u.origin+u.pathname);await route.abort();return;}
  if(u.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#101d1a"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});return;}
  if(u.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
  if(['/api/auth/member','/api/auth/ensure-member'].includes(u.pathname)){
   const headers=await req.allHeaders();assert.equal(headers.authorization,'Bearer '+TOKEN);assert.equal(headers.cookie,undefined);assert.equal(u.search,'');
   const response=await fixture.dispatch(u.pathname,{method:req.method(),headers,body:req.postData()??undefined});let status=response.status,body=await response.text();
   if(losePost&&req.method()==='POST'){losePost=false;assert.equal(status,200);status=503;body=JSON.stringify({error:'Synthetic delivery loss after real SQL commit'});}
   if(wrongGet&&req.method()==='GET'&&status===200){wrongGet=false;const parsed=JSON.parse(body);parsed.auth.subject=IDS.otherSubject;body=JSON.stringify(parsed);}
   http.push({path:u.pathname,method:req.method(),status,body:req.postData()??null});await route.fulfill({status,headers:{'content-type':'application/json','cache-control':'private, no-store'},body});return;
  }
  if(u.pathname==='/api/book-salons/11111111-1111-4111-8111-111111111111'&&req.method()==='GET'){
   http.push({path:u.pathname,method:'GET',status:200,scope:'synthetic-circle-dto'});
   await route.fulfill({contentType:'application/json',body:JSON.stringify({cohort:{id:'11111111-1111-4111-8111-111111111111',book_id:'soe-circles-path',title:'Synthetic gated Circle'},messages:[{id:'44444444-4444-4444-8444-444444444444',member_name:'Synthetic member',content:'PRIVATE_GATED_CIRCLE_MESSAGE',created_at:'2026-11-04T12:00:00Z',is_mine:true}]})});return;
  }
  unexpected.push(u.pathname);await route.abort();
 }catch(e){errors.push(e.stack||String(e));try{await route.abort();}catch{}}});
 await p.goto(ORIGIN);
 const button=name=>p.getByRole('button',{name,exact:true}),settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const state=()=>p.evaluate(()=>({stats:window.nativeQa.stats(),requests:window.nativeQa.requests.map(r=>({url:r.url,method:r.method,body:r.body,bodyRead:r.bodyRead,status:r.status,aborted:r.signal.aborted}))}));
 const ready=()=>p.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')==='Continue to Circle'&&!x.disabled));
 async function show({existing=false,other=false,network='online'}={}){
  await p.evaluate(()=>window.nativeQa.unmount());await settle();await fixture.close();fixture=await createProvisioningApp();
  if(existing)await fixture.seed({name:'PRIVATE_SYNTHETIC_NAME'});if(other)await fixture.seed({id:IDS.other,subject:IDS.otherSubject,name:'Unrelated cookie account'});
  losePost=false;wrongGet=false;await p.evaluate(value=>window.nativeQa.show(value),network);await button('Close member view').waitFor();await settle();
  if(network==='online')await p.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')==='Check my member account'&&!x.disabled));
 }
 async function check(){await button('Check my member account').click();await settle();}
 async function absent(){await check();await p.getByRole('checkbox',{name:'I want to set up a member record for this signed-in account',exact:true}).waitFor();}
 async function confirm(){await p.getByRole('checkbox',{name:'I want to set up a member record for this signed-in account',exact:true}).click();}
 await show({existing:true});assert.equal((await state()).requests.length,0);assert.equal(await button('Continue to Circle').isDisabled(),true);await check();await ready();
 assert.equal((await state()).requests.length,1);assert.equal(await p.getByRole('checkbox').count(),0);assert.doesNotMatch(await p.locator('body').innerText(),/PRIVATE_SYNTHETIC_NAME|PRIVATE_SYNTHETIC_EMAIL|PRIVATE_SERVICE_SECRET|aaaaaaaa-aaaa/);
 await button('Continue to Circle').click();await p.getByText('PRIVATE_GATED_CIRCLE_MESSAGE',{exact:true}).waitFor();assert.equal((await state()).requests.filter(r=>r.url.includes('/book-salons/')).length,1);
 pass('existing provider verification sends no account request automatically; explicit member GET and Continue are both required before the Circle subtree reads, with profile/subject omitted from UI');
 await show({other:true});await absent();assert.equal(await button('Set up my member account').isDisabled(),true);assert.equal(await button('Continue to Circle').isDisabled(),true);assert.equal((await fixture.rows()).length,1);
 await confirm();await button('Set up my member account').click();await ready();let current=await state();assert.deepEqual(current.requests.map(r=>r.method),['GET','POST','GET']);assert.equal(current.requests[1].body,'{}');
 let rows=await fixture.rows();assert.equal(rows.length,2);const created=rows.find(x=>x.supabase_auth_id===IDS.subject);assert.equal(created.id,IDS.created);assert.equal(created.tier,'free');assert.equal(created.exp_tokens,0);assert.equal(rows.find(x=>x.id===IDS.other).display_name,'Unrelated cookie account');assert.equal(fixture.providerCalls.some(c=>c.kind.startsWith('cookie')),false);
 pass('missing member requires explicit acknowledgement and one empty-body setup POST, then fresh matching GET; actual SQL creates only the verified bearer subject and preserves conflicting cookie account');
 await show();await absent();await confirm();losePost=true;await button('Set up my member account').click();await p.waitForFunction(()=>window.nativeQa.requests.some(r=>r.method==='POST'&&r.status===503));await settle();
 assert.equal((await fixture.rows()).length,1);assert.equal(await button('Continue to Circle').isDisabled(),true);assert.equal((await state()).requests.filter(r=>r.method==='POST').length,1);await check();await ready();assert.equal((await state()).requests.filter(r=>r.method==='POST').length,1);
 pass('committed setup with lost reply stays unconfirmed; manual GET establishes current membership without retrying setup or claiming the earlier creation receipt');
 await show();await absent();await confirm();fixture.failSql('XX000');await button('Set up my member account').click();await p.waitForFunction(()=>window.nativeQa.requests.some(r=>r.method==='POST'&&r.status===503));await settle();
 assert.equal((await fixture.rows()).length,0);assert.equal(await p.getByRole('checkbox').count(),0);fixture.failSql(null);await check();await p.getByRole('checkbox').waitFor();assert.equal(await button('Retry member setup').isDisabled(),true);assert.match(await p.locator('body').innerText(),/earlier setup may have completed/i);
 await confirm();await button('Retry member setup').click();await ready();assert.equal((await fixture.rows()).length,1);assert.deepEqual((await state()).requests.filter(r=>r.method==='POST').map(r=>r.body),['{}','{}']);
 pass('unknown setup followed by a fresh missing-account response offers an explicitly acknowledged same-body retry; no automatic resend and one actual SQL member');
 await show({existing:true});wrongGet=true;await check();await p.waitForFunction(()=>window.nativeQa.requests.at(-1)?.bodyRead);await settle();assert.equal(await button('Continue to Circle').isDisabled(),true);assert.equal(await p.getByRole('checkbox').count(),0);assert.doesNotMatch(await p.locator('body').innerText(),/PRIVATE_SYNTHETIC_NAME|PRIVATE_SYNTHETIC_EMAIL/);
 pass('mismatched server subject grants neither Circle entry nor setup permission and exposes no member profile');
 for(const retirement of ['blur','offline','owner','unmount']){
  await show({existing:true});await p.evaluate(()=>window.nativeQa.holdBody('GET','/api/auth/member'));await check();await p.waitForFunction(()=>window.nativeQa.requests.at(-1)?.bodyRead);
  await p.evaluate(kind=>{if(kind==='blur')window.nativeQa.activity('blur');else if(kind==='offline')window.nativeQa.network('offline');else if(kind==='owner')window.nativeQa.retire();else window.nativeQa.unmount();},retirement);await settle();assert.equal((await state()).requests.at(-1).aborted,true);await p.evaluate(()=>window.nativeQa.releaseBody());await settle();
  assert.equal(await p.getByText('PRIVATE_GATED_CIRCLE_MESSAGE',{exact:true}).count(),0);if(retirement!=='unmount')assert.equal(await button('Continue to Circle').isDisabled(),true);
 }
 pass('held account JSON cannot restore readiness after blur, offline, account retirement or unmount; request is aborted and Circle stays unmounted');
 await show();await absent();await confirm();await p.evaluate(()=>window.nativeQa.holdBody('POST','/api/auth/ensure-member'));await button('Set up my member account').click();await p.waitForFunction(()=>window.nativeQa.requests.at(-1)?.method==='POST'&&window.nativeQa.requests.at(-1)?.bodyRead);assert.equal((await fixture.rows()).length,1);
 await p.evaluate(()=>window.nativeQa.activity('blur'));await settle();await p.evaluate(()=>window.nativeQa.releaseBody());await settle();assert.equal(await button('Continue to Circle').isDisabled(),true);assert.equal((await state()).requests.map(r=>r.method).join(','),'GET,POST');
 pass('already committed setup retired during its held receipt does not start readback or restore ready state; late success cannot open Circle');
 for(const retirement of ['blur','offline','owner']){
  await show({existing:true});await check();await ready();await button('Continue to Circle').click();await p.getByText('PRIVATE_GATED_CIRCLE_MESSAGE',{exact:true}).waitFor();const before=(await state()).requests.length;
  await p.evaluate(kind=>{if(kind==='blur')window.nativeQa.activity('blur');else if(kind==='offline')window.nativeQa.network('offline');else window.nativeQa.retire();},retirement);await button('Close member view').waitFor();await settle();assert.equal(await p.getByText('PRIVATE_GATED_CIRCLE_MESSAGE',{exact:true}).count(),0);
  await p.evaluate(()=>{window.nativeQa.network('online');window.nativeQa.activity('focus');});await settle();assert.equal((await state()).requests.length,before);assert.equal(await button('Continue to Circle').isDisabled(),true);
 }
 pass('activity, network and owner retirement unmount an entered Circle and erase private content; returning online/active performs no account or Circle fetch');
 await show({network:'unknown'});assert.equal((await state()).requests.length,0);assert.equal((await state()).stats.providerReads,0);assert.equal(await button('Check my member account').isDisabled(),true);await p.evaluate(()=>window.nativeQa.network('online'));await settle();assert.equal((await state()).requests.length,0);
 await button('Check existing sign-in').click();await p.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')==='Check my member account'&&!x.disabled));await absent();
 const heights=await p.locator('button:visible').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().height));assert(heights.every(h=>h>=48));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await p.getByRole('checkbox').focus();assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('role')),'checkbox');await p.screenshot({path:path.join(ROOT,'verification/web/evidence/native-account-setup-320.png'),fullPage:true});
 await button('Close member view').click();await p.getByText('Member view closed',{exact:true}).waitFor();await settle();stats=await state();assert.equal(stats.stats.ownerListeners,0);assert.equal(stats.stats.netListeners,0);assert.equal(stats.stats.appListeners,0);
 pass('unknown connectivity does not verify or read; explicit recovery and 48px keyboard-accessible account controls work at320px; global Close disposes all observers');
 for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Source changed during proof '+n);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
}catch(e){failure=e.stack||String(e);}finally{
 write(failure?'FAIL':'CLEANING_UP');try{if(page)await bounded(()=>page.evaluate(()=>{window.nativeQa?.releaseBody();window.nativeQa?.releaseCredential();window.nativeQa?.unmount();}));}catch{}
 try{if(browser)await bounded(()=>browser.close());cleanup.browser=browser?'closed':'not-created';}catch(e){cleanup.browser='failed';failure??=e.stack||String(e);}
 try{if(fixture)await bounded(()=>fixture.close());cleanup.database=fixture?'closed':'not-created';}catch(e){cleanup.database='failed';failure??=e.stack||String(e);}
 try{assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Source changed during cleanup '+n);}catch(e){failure??=e.stack||String(e);}write(failure?'FAIL':'PASS');
}
if(failure)throw Error(failure);console.log('PASS native account setup: '+stories.length+' stories.');
