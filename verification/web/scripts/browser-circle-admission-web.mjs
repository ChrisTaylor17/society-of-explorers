import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),[run,...extra]=process.argv.slice(2);
assert(!extra.length&&run&&/^[a-z0-9-]{1,48}$/.test(run));
assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')));
const dir=path.join(ROOT,'verification/web/evidence/circle-admission-web-fixture-'+run),out=path.join(ROOT,'verification/web/evidence/circle-admission-web-browser-'+run+'.json');
assert(!fs.existsSync(out));
const sha=b=>createHash('sha256').update(b).digest('hex'),sourceHashes=JSON.parse(fs.readFileSync(path.join(dir,'source-manifest.json'))).sourceHashes;
sourceHashes['verification/web/scripts/browser-circle-admission-web.mjs']=sha(fs.readFileSync(new URL(import.meta.url)));
const stories=[],errors=[],unexpected=[],http=[],cleanup={browser:false,database:false};let fixture,browser,context,page,failure;
const write=status=>fs.writeFileSync(out,JSON.stringify({status,stories,errors,unexpected,http,cleanup,sourceHashes,failure,
 scope:'Actual React web invitation and creation screens plus real route handlers and current PGlite SQL. Browser credentials/account endpoint, canonical server identity, PostgREST and Next Link are explicit doubles. All Chromium requests intercepted; no hosted identity, provider, device or deployment acceptance. Raw codes are not written in the HTTP log.'},null,2)+'\n');
const pass=name=>{stories.push(name);console.log('PASS '+stories.length+': '+name);write('RUNNING');};
try{
 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(fs.readFileSync(path.join(ROOT,name))),hash,'Source changed: '+name);
 process.chdir(path.join(ROOT,'verification/web'));
 const {admissionApp,IDS,requestId}=await import('../tests/support/circle-admission-app.mjs');fixture=await admissionApp();
 const tokens={host:IDS.newcomer,member:IDS.reader,other:IDS.newcomer2},bundle=fs.readFileSync(path.join(dir,'page.js')),css=fs.readFileSync(path.join(dir,'participation.css'));
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath:'/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 context=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(6500);
 let lostJoin=false,lostRevoke=false;const originalRpc=fixture.admin.rpc;
 fixture.admin.rpc=async(name,args)=>{const r=await originalRpc(name,args);if(name==='soe_circle_join_invited'&&lostJoin){lostJoin=false;throw Error('Synthetic lost join reply');}if(name==='soe_circle_invitation_revoke'&&lostRevoke){lostRevoke=false;throw Error('Synthetic lost revoke reply');}return r;};
 page.on('pageerror',e=>errors.push(String(e)));
 await context.route('**/*',async route=>{try{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!=='https://offline.invalid'){unexpected.push(url.origin+url.pathname);await route.abort();return;}
  if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0;background:#0d1117;color:#eee"><div id="root"></div><script src="/fixture.js"></script></body></html>'});return;}
  if(url.pathname==='/fixture.js'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
  if(url.pathname==='/fixture.css'){await route.fulfill({contentType:'text/css',body:css});return;}
  if(url.pathname==='/favicon.ico'){await route.fulfill({status:204});return;}
  const headers=await req.allHeaders(),token=(headers.authorization??'').replace(/^Bearer /,''),actor=tokens[token]??null;fixture.setActor(actor);
  assert.equal(headers.apikey,undefined);assert.equal(headers.cookie,undefined);
  if(url.pathname==='/api/auth/member'){
   http.push({path:url.pathname,method:req.method(),actorPresent:!!actor,status:actor?200:401});
   await route.fulfill({status:actor?200:401,contentType:'application/json',body:JSON.stringify(actor?{member:{id:actor,display_name:'Synthetic '+token},auth:{provider:'wallet',subject:'synthetic-'+actor}}:{error:'signed out'})});return;
  }
  const body=req.postData()?JSON.parse(req.postData()):undefined;
  const entry={path:url.pathname,method:req.method(),keys:body?Object.keys(body):[],status:null};http.push(entry);
  assert(url.pathname.startsWith('/api/circles'),'Unexpected path');
  let response;
  if(/^\/api\/circles\/[a-f0-9-]+\/(recipient-code|admission-access|invitation-check|invitation-receipt|invitation-review|invitations|join-invited|invitations\/revoke)$/.test(url.pathname))response=await fixture.dispatchAdmission(url.pathname,{body,method:req.method(),headers});
  else response=await fixture.dispatch(url.pathname,req.method(),body,headers);
  entry.status=response.status;
  await route.fulfill({status:response.status,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:await response.text()});
 }catch(error){errors.push(String(error));try{await route.abort();}catch{}}});
 await page.goto('https://offline.invalid');await page.waitForFunction(()=>window.admissionQa);
 const button=name=>page.getByRole('button',{name,exact:true});
 const ready=name=>page.waitForFunction(name=>[...document.querySelectorAll('button')].some(e=>e.textContent===name&&!e.disabled),name);
 const show=async(who,circleId)=>{await page.evaluate(v=>window.admissionQa.show(v),{token:who,circleId});await ready(circleId?'Check invitation access':'Check hosting access');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 const load=async()=>{await button('Check invitation access').click();await page.getByText(/Signed in as/).waitFor();await ready('Check invitation access');};
 const rows=async circle=>(await fixture.db.query('SELECT count(*)::int n FROM book_cohort_members WHERE cohort_id=$1',[circle])).rows[0].n;
 await show('host');await button('Check hosting access').click();await page.getByLabel('Circle name',{exact:true}).waitFor();
 await page.getByLabel('Circle name',{exact:true}).fill('Private admission browser salon');
 await page.getByRole('radio',{name:'Online',exact:true}).check();
 await page.getByLabel('Private video link (https)',{exact:true}).fill('https://meeting.example.invalid/SYNTHETIC_PRIVATE_ROOM');
 await page.getByLabel('First week starts',{exact:true}).fill(new Date(Date.now()+2*86400000).toISOString().slice(0,10));
 await page.getByLabel('Time zone',{exact:true}).selectOption('UTC');await page.getByLabel('Who can join',{exact:true}).selectOption('host_approval');
 await page.getByRole('checkbox',{name:/I will use a public venue/}).check();await button('Review my Circle listing').click();
 await page.getByRole('heading',{name:'Review your Circle listing',exact:true}).waitFor();
 assert.match(await page.locator('body').innerText(),/listing stays public/);
 assert.equal((await fixture.db.query("SELECT count(*)::int n FROM book_cohorts WHERE title='Private admission browser salon'")).rows[0].n,0);
 await page.getByRole('checkbox',{name:/I checked the public listing/}).check();await button('Confirm and list my Circle').click();
 const link=page.getByRole('link',{name:'Open my Circle',exact:true});await link.waitFor();const circle=(await link.getAttribute('href')).split('/').at(-1);
 assert.equal((await fixture.db.query('SELECT circle_admission_mode FROM book_cohorts WHERE id=$1',[circle])).rows[0].circle_admission_mode,'host_approval');assert.equal(await rows(circle),1);
 pass('Actual hosting screen reviews public disclosure and creates a host-approved salon only after explicit confirmation.');
 await show('member',circle);await load();
 assert(await button('Create my sharing code').isDisabled());await page.getByRole('checkbox',{name:/I choose to share my member name/}).check();await button('Create my sharing code').click();
 const sharing=page.getByLabel('My one-hour sharing code',{exact:true});await sharing.waitFor();const recipientCode=await sharing.inputValue();assert.match(recipientCode,/^soe-cr1\./);assert.equal(await rows(circle),1);
 await page.evaluate(()=>window.admissionQa.activity(false));await page.waitForFunction(()=>!document.querySelector('textarea'));await page.evaluate(()=>window.admissionQa.activity(true));
 pass('Recipient sharing requires opt-in, grants no membership, and clears the raw code on blur.');
 await show('host',circle);await load();await page.getByLabel('Recipient sharing code',{exact:true}).fill(recipientCode);await button('Review recipient').click();
 await page.getByRole('heading',{name:'Review this recipient',exact:true}).waitFor();assert(await button('Issue approval code').isDisabled());
 await page.screenshot({path:path.join(dir,'host-review-320.png'),fullPage:true});
 await page.getByRole('checkbox',{name:/I reviewed the account/}).check();await button('Issue approval code').click();
 const issued=page.getByLabel('Approval code for the reviewed recipient',{exact:true});await issued.waitFor();const approval=await issued.inputValue();assert.match(approval,/^soe-ci1\./);assert.equal(await rows(circle),1);
 pass('Host reviews the code owner and issues an account-bound approval without admitting them.');
 await show('other',circle);await load();await page.getByLabel('Host approval code',{exact:true}).fill(approval);await button('Review my approval').click();await ready('Check invitation access');
 assert.match(await page.getByRole('status').innerText(),/could not be verified/);assert.equal(await rows(circle),1);
 pass('A forwarded approval is refused before any membership write.');
 await show('member',circle);await load();await page.getByLabel('Host approval code',{exact:true}).fill(approval);await button('Review my approval').click();
 await page.getByRole('heading',{name:'Review joining this salon',exact:true}).waitFor();assert.equal(await rows(circle),1);assert(await button('Confirm join').isDisabled());
 const oldConfirm=await page.evaluate(()=>window.admissionQa.retain('Confirm join'));
 await page.evaluate(()=>window.admissionQa.activity(false));await page.waitForFunction(()=>!document.querySelector('textarea'));await page.evaluate(()=>window.admissionQa.activity(true));
 const before=http.length;await page.evaluate(id=>window.admissionQa.invoke(id),oldConfirm);await page.waitForTimeout(40);assert.equal(http.length,before);assert.equal(await rows(circle),1);
 pass('Blur clears an unconfirmed approval; a retained stale confirm callback transmits nothing.');
 await load();await page.getByLabel('Host approval code',{exact:true}).fill(approval);await button('Review my approval').click();await page.getByRole('heading',{name:'Review joining this salon',exact:true}).waitFor();
 await page.getByRole('checkbox',{name:/I reviewed the account/}).check();
 const staleBefore=http.length;await page.evaluate(id=>window.admissionQa.invoke(id),oldConfirm);await page.waitForTimeout(40);assert.equal(http.length,staleBefore);
 lostJoin=true;await button('Confirm join').click();await ready('Check invitation access');
 assert.match(await page.getByRole('status').innerText(),/uncertain/);assert.equal(await rows(circle),2);assert.equal(await page.locator('textarea').count(),0);
 await page.evaluate(()=>window.admissionQa.identity('other'));await ready('Check invitation access');await button('Check invitation access').click();await ready('Check invitation access');
 assert.match(await page.getByRole('status').innerText(),/different account/);assert.equal(await button('Check earlier invitation result').count(),0);
 await page.evaluate(()=>window.admissionQa.identity('member'));await ready('Check invitation access');await load();
 const oldSecret=fixture.app.context.process.env.NEXTAUTH_SECRET;fixture.app.context.process.env.NEXTAUTH_SECRET='';
 try{await button('Check earlier invitation result').click();await ready('Check invitation access');assert.match(await page.getByRole('status').innerText(),/earlier join was recorded/);}
 finally{fixture.app.context.process.env.NEXTAUTH_SECRET=oldSecret;}
 assert.equal(await rows(circle),2);assert.equal(http.filter(e=>e.path.endsWith('/join-invited')).length,1);
 pass('Lost post-commit reply stays uncertain, hides recovery from another account, and recovers with no token, signing key or second join.');
 await show('host',circle);await load();await button('Review revocation').click();await page.getByRole('heading',{name:'Review revoking outstanding approvals',exact:true}).waitFor();
 await page.getByRole('checkbox',{name:/I reviewed the account/}).check();lostRevoke=true;await button('Confirm revocation').click();await ready('Check invitation access');assert.match(await page.getByRole('status').innerText(),/uncertain/);
 await load();await button('Check earlier invitation result').click();await page.getByRole('heading',{name:'Review revoking outstanding approvals',exact:true}).waitFor();
 await page.getByRole('checkbox',{name:/I reviewed the account/}).check();await button('Confirm revocation').click();await ready('Check invitation access');
 assert.match(await page.getByRole('status').innerText(),/Revocation recorded/);assert.equal((await fixture.db.query('SELECT circle_invitation_revision r FROM book_cohorts WHERE id=$1',[circle])).rows[0].r,2);
 assert.equal(await rows(circle),2);pass('Lost revocation uses the exact original request on explicit retry, advances once and preserves members.');
 await load();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const k of ['localStorage','sessionStorage'])assert.equal(await page.evaluate(k=>window[k].length,k),0);
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(dir,'host-controls-320.png'),fullPage:true});
 pass('320px controls fit, browser storage stays empty, and all requests remain on intercepted local fixture paths.');
 await button('Review revocation').focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Review revoking outstanding approvals',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'H2');await button('Cancel invitation review').click();assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('role')),'status');
 await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 pass('Keyboard opens the review, cancellation restores focus to status, and desktop controls fit.');

 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(fs.readFileSync(path.join(ROOT,name))),hash,'Source drift');
}catch(error){failure=error.stack||String(error);if(page){try{failure+='\n'+JSON.stringify({stats:await page.evaluate(()=>window.admissionQa.stats()),text:(await page.locator('body').innerText()).replace(/soe-c[ir]1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted code]')});}catch{}}throw error;}finally{
 if(browser){await browser.close();cleanup.browser=true;}if(fixture){await fixture.close();cleanup.database=true;}
 write(failure?'FAIL':'PASS');
}
