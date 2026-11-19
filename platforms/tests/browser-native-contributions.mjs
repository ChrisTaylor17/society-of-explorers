import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),file='verification/web/evidence/native-contributions-browser.json',sha=b=>createHash('sha256').update(b).digest('hex');
function read(name){const p=path.resolve(ROOT,name),s=fs.lstatSync(p);assert(!s.isSymbolicLink()&&s.isFile()&&(!s.size||s.blocks),'Refuse linked/offloaded source '+name);return fs.readFileSync(p);}
function runtime(p){const s=fs.statSync(p);assert(s.size&&s.blocks,'Refuse offloaded runtime');}
async function bounded(fn,ms=5000){let t;try{return await Promise.race([fn(),new Promise((_,no)=>t=setTimeout(()=>no(Error('Owned operation timed out')),ms))]);}finally{clearTimeout(t);}}
read('verification/web/tests/support/member-contributions-app.mjs');
process.chdir(path.join(ROOT,'verification/web'));
const {createMemberContributionsApp,ORIGIN,TOKENS,contributionAppHashes}=await import('../../verification/web/tests/support/member-contributions-app.mjs');
const priorReceipt=fs.existsSync(path.join(ROOT,file))?{sha256:sha(read(file)),receipt:JSON.parse(read(file))}:null,startedAt=new Date().toISOString(),stories=[],errors=[],unexpected=[],http=[],cleanup={browser:'pending',database:'pending'};
let sourceHashes={},bundle,browser,page,fixture,failure=null,losePost=false,mutation=null,stats;
function write(status){fs.writeFileSync(path.join(ROOT,file),JSON.stringify({status,startedAt,completedAt:new Date().toISOString(),stories,errors,unexpected,http,cleanup,sourceHashes,bundleSHA256:bundle?sha(bundle):null,stats,priorReceipt,failure,
 scope:'Actual native account/contributions TSX and portable controllers to canonical member, contributions and message handlers and actual Circle SQL in disposable PGlite. React Native DOM primitives/AppState/connectivity, existing SDK identity, server authenticated-member boundary and delivery are explicit synthetic doubles. No Circle archive or membership request is supplied by this proof. No issued credential, provider acceptance, native compilation/Hermes/Codegen/OS storage/networking, production SQL or device acceptance.'},null,2)+'\n');}
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};write('RUNNING');
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')),'Startup guard required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');runtime(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';runtime(executablePath);
 bundle=read('verification/web/evidence/native-contributions-fixture/page.js');
 sourceHashes={...JSON.parse(read('verification/web/evidence/native-contributions-fixture/source-manifest.json')).sourceHashes,...await contributionAppHashes(),'platforms/tests/browser-native-contributions.mjs':sha(read('platforms/tests/browser-native-contributions.mjs'))};
 for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Rebundle changed source '+n);
 fixture=await createMemberContributionsApp();
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:800}});page=await context.newPage();const p=page;p.setDefaultTimeout(6000);
 p.on('pageerror',e=>errors.push(e.stack||String(e)));p.on('console',m=>{if(m.type()==='error'&&!/^Failed to load resource: the server responded with a status of (401|403|404|409|503)/.test(m.text()))errors.push(m.text());});
 await context.route('**/*',async route=>{try{
  const req=route.request(),u=new URL(req.url());if(u.origin!==ORIGIN){unexpected.push(u.origin+u.pathname);await route.abort();return;}
  if(u.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#101d1a"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});return;}
  if(u.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
  if(u.pathname==='/api/auth/member'||u.pathname==='/api/circles/contributions'||/^\/api\/circles\/[^/]+\/messages\/[^/]+$/.test(u.pathname)){
   const headers=await req.allHeaders();assert.equal(headers.authorization,'Bearer '+TOKENS.author);assert.equal(headers.cookie,undefined);
   if(u.pathname==='/api/circles/contributions')assert(/^$|^\?after=[0-9a-f-]{36}$/.test(u.search));else assert.equal(u.search,'');
   const response=await fixture.dispatch(u.pathname+u.search,{method:req.method(),headers,body:req.postData()??undefined});let status=response.status,body=await response.text();
   if(losePost&&req.method()==='POST'){losePost=false;assert.equal(status,200);status=503;body=JSON.stringify({error:'Synthetic delivery loss after actual SQL commit'});}
   if(mutation){const changed=mutation({path:u.pathname,method:req.method(),status,body});if(changed){({status,body}=changed);mutation=null;}}
   http.push({path:u.pathname+u.search,method:req.method(),status,body:req.postData()??null});await route.fulfill({status,headers:{'content-type':'application/json','cache-control':'private, no-store'},body});return;
  }
  unexpected.push(u.pathname);await route.abort();
 }catch(e){errors.push(e.stack||String(e));try{await route.abort();}catch{}}});
 await p.goto(ORIGIN);
 const button=name=>p.getByRole('button',{name,exact:true}),settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const state=()=>p.evaluate(()=>({stats:window.nativeQa.stats(),requests:window.nativeQa.requests.map(r=>({url:r.url,method:r.method,body:r.body,bodyRead:r.bodyRead,status:r.status,aborted:r.signal.aborted}))}));
 const enabled=name=>p.waitForFunction(name=>[...document.querySelectorAll('button')].some(x=>x.getAttribute('aria-label')===name&&!x.disabled),name);
 const selection=()=>button('Check this contribution');
 async function show(network='online'){
  await p.evaluate(()=>window.nativeQa.unmount());await settle();await fixture.close();fixture=await createMemberContributionsApp();losePost=false;mutation=null;
  await p.evaluate(({network,circleId})=>window.nativeQa.show(network,circleId),{network,circleId:fixture.circleId});await button('Close member view').waitFor();await settle();
  if(network==='online')await enabled('Check my member account');
 }
 async function enter(){await button('Check my member account').click();await enabled('View my contributions');await button('View my contributions').click();await enabled('Load my posted messages');}
 async function load(){await button('Load my posted messages').click();await selection().first().waitFor();await settle();}
 async function selectFirst(){await selection().first().click();await enabled('Check current message state');await settle();}
 async function confirm(){await p.getByRole('checkbox',{name:'I understand withdrawal removes this message from member views and cannot be undone here',exact:true}).click();}
 async function withdrawn(){await p.getByText('Withdrawal confirmed. The message is removed from member views; restricted safety evidence may remain.',{exact:true}).waitFor();}
 await show();assert.equal((await state()).requests.length,0);assert.equal(await button('View my contributions').isDisabled(),true);await enter();assert.deepEqual((await state()).requests.map(r=>new URL(r.url).pathname),['/api/auth/member']);
 assert.equal(await selection().count(),0);await button('Return to member account').click();await enabled('View my contributions');await button('View my contributions').click();await enabled('Load my posted messages');assert.equal((await state()).requests.length,1);
 pass('verified account needs an explicit member check and contributions entry; mount, re-entry and return to account perform no list, archive, membership or action request');
 const first=(await fixture.state()).message.content,secondCircle=await fixture.addCircle(),second='PRIVATE_OWN_SECOND_CIRCLE';await fixture.post({circleId:secondCircle,content:second});await fixture.post({who:'other',content:'PRIVATE_OTHER_MEMBER_BODY'});
 await fixture.leave();await fixture.leave('author',secondCircle);await fixture.quarantine();await fixture.quarantine(secondCircle);
 await load();assert.equal(await selection().count(),2);await p.getByText(first,{exact:true}).waitFor();await p.getByText(second,{exact:true}).waitFor();assert.doesNotMatch(await p.locator('body').innerText(),/PRIVATE_OTHER_MEMBER_BODY/);
 const before=(await fixture.counts()).receipts;await p.getByText(second,{exact:true}).locator('..').getByRole('button').click();await enabled('Check current message state');assert.equal(await p.getByText(first,{exact:true}).count(),0);assert.equal(await selection().count(),0);
 assert.equal(await button('Withdraw my message').isDisabled(),true);assert.match(await p.locator('body').innerText(),/not physical erasure/);await confirm();await button('Withdraw my message').click();await withdrawn();assert.equal((await fixture.counts()).receipts,before+1);
 assert.equal(await p.getByRole('button',{name:/report|allow ai|consent/i}).count(),0);assert.equal((await fixture.counts()).reports,0);
 pass('fresh author history spans two actually left and quarantined Circles, excludes another member, clears other bodies on selection and permits only acknowledged withdrawal after fresh own-state GET');
 await show();for(let i=0;i<26;i++)await fixture.post({content:'PRIVATE_PAGED_OWN_'+String(i).padStart(2,'0')});await fixture.post({who:'other',content:'PRIVATE_PAGED_OTHER'});await enter();await load();assert.equal(await selection().count(),25);
 const firstBody=await selection().first().locator('..').innerText(),firstPosts=(await state()).requests.filter(r=>r.method==='POST').length;await button('Next page of my messages').click();await p.waitForFunction(()=>[...document.querySelectorAll('button')].filter(x=>x.getAttribute('aria-label')==='Check this contribution').length===2);await settle();
 assert.equal(await button('Next page of my messages').count(),0);assert(!((await p.locator('body').innerText()).includes(firstBody)));assert.doesNotMatch(await p.locator('body').innerText(),/PRIVATE_PAGED_OTHER/);assert.equal((await state()).requests.filter(r=>r.method==='POST').length,firstPosts);
 assert.match(new URL((await state()).requests.at(-1).url).search,/^\?after=[0-9a-f-]{36}$/);
 pass('27 own messages paginate as 25 then 2 with an exact after-only GET, replacing the prior page and never including another author or issuing a write');
 await show();const hidden=(await fixture.state()).message.content;await fixture.hide();await enter();await load();assert.equal(await p.getByText(hidden,{exact:true}).count(),0);await selectFirst();await p.getByText('A synthetic human reviewer recorded an author-facing explanation.',{exact:true}).waitFor();assert.equal(await p.getByText(hidden,{exact:true}).count(),0);assert.match(await p.locator('body').innerText(),/restricted by moderation/);assert.equal(await button('Withdraw my message').isDisabled(),true);
 pass('hidden own message displays a tombstone and fresh author-facing explanation without restoring its original body or exposing reporter notes');
 await show();await enter();await load();await selectFirst();await confirm();const receipts=(await fixture.counts()).receipts;losePost=true;await button('Withdraw my message').click();await button('Retry exact withdrawal').waitFor();
 for(const label of ['Load my posted messages','Back to my contributions','Return to member account'])assert.equal(await button(label).isDisabled(),true);assert.equal((await fixture.counts()).receipts,receipts+1);
 const exact=(await state()).requests.find(r=>r.method==='POST').body;await button('Check current message state').click();await enabled('Check current message state');assert.match(await p.locator('body').innerText(),/does not confirm the earlier action/);assert.equal(await button('Return to member account').isDisabled(),true);assert.equal((await state()).requests.filter(r=>r.method==='POST').length,1);
 await button('Retry exact withdrawal').click();await withdrawn();assert.deepEqual((await state()).requests.filter(r=>r.method==='POST').map(r=>r.body),[exact,exact]);assert.equal((await fixture.counts()).receipts,receipts+1);assert.equal(await button('Return to member account').isDisabled(),false);
 pass('lost committed withdrawal blocks list/back/account navigation; current GET cannot confirm it, and explicit retry sends identical bytes and replays one actual SQL receipt');
 for(const bad of ['nonown-page','nonown-state','wrong-tuple']){
  await show();await enter();mutation=({path,method,status,body})=>{if(status!==200||method!=='GET'||(bad==='nonown-page'?path!=='/api/circles/contributions':!path.includes('/messages/')))return null;const data=JSON.parse(body);if(bad==='nonown-page')data.items[0].message.is_mine=false;else if(bad==='nonown-state')data.message.is_mine=false;else data.circleId='ffffffff-ffff-4fff-8fff-ffffffffffff';return{status,body:JSON.stringify(data)};};
  if(bad==='nonown-page'){await button('Load my posted messages').click();await p.getByText('Your posted messages could not be verified. Refresh manually when ready.',{exact:true}).waitFor();assert.equal(await selection().count(),0);}
  else{await load();await selection().first().click();await p.getByText('Current message information could not be verified. No action has been assumed.',{exact:true}).waitFor();assert.equal(await p.getByRole('checkbox').count(),0);assert.equal(await button('Withdraw my message').count(),0);}
  assert.equal((await state()).requests.filter(r=>r.method==='POST').length,0);
 }
 pass('malformed author ownership or selected tuple is rejected before private state/action controls, with no withdrawal request');
 for(const stage of ['list','selected','withdrawal'])for(const retirement of ['blur','offline','owner','unmount']){
  await show();await enter();if(stage!=='list')await load();if(stage==='withdrawal'){await selectFirst();await confirm();}
  const endpoint=stage==='list'?'/api/circles/contributions':`/api/circles/${fixture.circleId}/messages/${fixture.messageId}`;
  await p.evaluate(({method,path})=>window.nativeQa.holdBody(method,path),{method:stage==='withdrawal'?'POST':'GET',path:endpoint});
  if(stage==='list')await button('Load my posted messages').click();else if(stage==='selected')await selection().first().click();else await button('Withdraw my message').click();
  await p.waitForFunction(({endpoint,method})=>{const r=window.nativeQa.requests.at(-1);return r&&new URL(r.url).pathname===endpoint&&r.method===method&&r.bodyRead;},{endpoint,method:stage==='withdrawal'?'POST':'GET'});const count=(await state()).requests.length;
  await p.evaluate(kind=>{if(kind==='blur')window.nativeQa.activity('blur');else if(kind==='offline')window.nativeQa.network('offline');else if(kind==='owner')window.nativeQa.retire();else window.nativeQa.unmount();},retirement);await settle();assert.equal((await state()).requests.at(-1).aborted,true);
  await p.evaluate(()=>window.nativeQa.releaseBody());await settle();assert.equal(await button('Load my posted messages').count(),0);assert.equal(await button('Retry exact withdrawal').count(),0);assert.equal(await selection().count(),0);
  await p.evaluate(()=>{window.nativeQa.network('online');window.nativeQa.activity('focus');});await settle();assert.equal((await state()).requests.length,count);
 }
 pass('held list, selected-state and committed-withdrawal JSON is retired on blur, offline, account loss or unmount; all requests abort and late replies cannot restore private UI or auto-send');
 await show();await enter();await load();await selectFirst();await confirm();losePost=true;await button('Withdraw my message').click();await button('Retry exact withdrawal').waitFor();await button('Close member view').click();await p.getByText('Member view closed',{exact:true}).waitFor();await settle();stats=await state();assert.equal(stats.stats.ownerListeners,0);assert.equal(stats.stats.netListeners,0);assert.equal(stats.stats.appListeners,0);
 const sent=stats.requests.filter(r=>r.method==='POST').length;await p.evaluate(circle=>window.nativeQa.show('online',circle),fixture.circleId);await enabled('Check my member account');await enter();assert.equal((await state()).requests.filter(r=>r.method==='POST').length,0);assert.equal(sent,1);await load();await selectFirst();assert.equal(await button('Retry exact withdrawal').count(),0);assert.match(await p.locator('body').innerText(),/contribution was withdrawn/);
 pass('global close is available during uncertainty, clears all observers and the pending key, and a new view requires explicit reads without retrying the retired action');
 await show('unknown');assert.equal((await state()).requests.length,0);assert.equal((await state()).stats.providerReads,0);await p.evaluate(()=>window.nativeQa.network('online'));await settle();assert.equal((await state()).requests.length,0);await button('Check existing sign-in').click();await enabled('Check my member account');await enter();await load();await selectFirst();
 const heights=await p.locator('button:visible').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().height));assert(heights.every(h=>h>=48));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await p.getByRole('checkbox').focus();assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('role')),'checkbox');await p.screenshot({path:path.join(ROOT,'verification/web/evidence/native-contributions-320.png'),fullPage:true});
 await button('Close member view').click();await p.getByText('Member view closed',{exact:true}).waitFor();await settle();stats=await state();assert.equal(stats.stats.ownerListeners,0);assert.equal(stats.stats.netListeners,0);assert.equal(stats.stats.appListeners,0);
 pass('unknown connectivity requires explicit recovery; readable 320px contribution controls have keyboard acknowledgement and 48px targets, with complete observer cleanup');
 assert(http.every(r=>!r.path.includes('book-salons')&&!r.path.includes('/join')&&!r.path.includes('/participation')));for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Source changed during proof '+n);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
}catch(e){failure=e.stack||String(e);}finally{
 write(failure?'FAIL':'CLEANING_UP');try{if(page)await bounded(()=>page.evaluate(()=>{window.nativeQa?.releaseBody();window.nativeQa?.releaseCredential();window.nativeQa?.unmount();}));}catch{}
 try{if(browser)await bounded(()=>browser.close());cleanup.browser=browser?'closed':'not-created';}catch(e){cleanup.browser='failed';failure??=e.stack||String(e);}
 try{if(fixture)await bounded(()=>fixture.close());cleanup.database=fixture?'closed':'not-created';}catch(e){cleanup.database='failed';failure??=e.stack||String(e);}
 try{assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[n,h]of Object.entries(sourceHashes))assert.equal(sha(read(n)),h,'Source changed during cleanup '+n);}catch(e){failure??=e.stack||String(e);}write(failure?'FAIL':'PASS');
}
if(failure)throw Error(failure);console.log('PASS native contributions: '+stories.length+' stories.');
