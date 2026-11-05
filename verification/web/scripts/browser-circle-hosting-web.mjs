import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const [run,...extra]=process.argv.slice(2);
if(extra.length||(run!==undefined&&(run.length>64||run.split('-').some(part=>!part||/[^a-z0-9]/.test(part)))))throw Error('Expected one optional evidence run name');
const suffix=run?'-'+run:'';
const ROOT=process.cwd(),output='verification/web/evidence/circle-hosting-web-browser'+suffix+'.json',sha=b=>createHash('sha256').update(b).digest('hex');
if(run&&fs.existsSync(output))throw Error('Evidence run already exists');
const fixtureDir='verification/web/evidence/circle-hosting-web-fixture'+suffix;
function read(name){const file=path.resolve(ROOT,name),s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Unavailable source '+name);return fs.readFileSync(file);}
read('verification/web/tests/support/public-profile-app.mjs');
process.chdir(path.join(ROOT,'verification/web'));
const {createPublicProfileApp: createCircleHostingApp,publicProfileAppHashes: hostingAppHashes,ORIGIN,TOKENS}=await import('../tests/support/public-profile-app.mjs');
const startedAt=new Date().toISOString(),stories=[],errors=[],unexpected=[],http=[],cleanup={browser:'pending',database:'pending'};
let browser,page,fixture,bundle,sourceHashes={},stats,failure=null,after=null,before=null,hold=false,held=null,cookie=null;
const write=status=>fs.writeFileSync(path.join(ROOT,output),JSON.stringify({status,startedAt,completedAt:new Date().toISOString(),stories,errors,unexpected,http,cleanup,sourceHashes,stats,failure,bundleSHA256:bundle?sha(bundle):null,
 scope:'Actual web StartCircleForm/useCircleHosting and pinned reading editor and Circle stylesheet in cached React/Chromium; actual canonical member, hosting access, create and detail handlers over current disposable SQL. Browser credentials/auth events, Next Link, provider identity and HTTP delivery are explicit doubles. Local held requests, response transformations, deadline callbacks and retained actual DOM React callbacks exercise adverse lifetimes. No real wallet, provider account, production SQL, native runtime or deployment; offloaded jsdom is not read.'},null,2)+'\n');
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};
async function bounded(fn,ms=6000){let timer;try{return await Promise.race([fn(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Bounded operation timed out')),ms))]);}finally{clearTimeout(timer);}}
write('RUNNING');
try{
 assert(process.execArgv.some(value=>value.endsWith('/deny-build-network.cjs')),'Startup network guard required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');read(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';read(executablePath);
 bundle=read(fixtureDir+'/page.js');const css=read(fixtureDir+'/participation.css');
 sourceHashes={...JSON.parse(read(fixtureDir+'/source-manifest.json')).sourceHashes,...await hostingAppHashes(),
  'verification/web/scripts/browser-circle-hosting-web.mjs':sha(read('verification/web/scripts/browser-circle-hosting-web.mjs'))};
 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(read(name)),hash,'Changed source '+name);
 fixture=await createCircleHostingApp();
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850}});page=await context.newPage();const p=page;p.setDefaultTimeout(6000);
 p.on('pageerror',error=>errors.push(error.stack||String(error)));p.on('console',message=>{if(message.type()==='error'&&!/^Failed to load resource: the server responded with a status of (400|401|403|404|409|413|429|503)/.test(message.text()))errors.push(message.text());});
 await context.route('**/*',async route=>{try{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===ORIGIN&&url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/participation.css"><body style="margin:0;background:#0a0a0a;font-family:system-ui,sans-serif"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});return;}
  if(url.origin===ORIGIN&&url.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
  if(url.origin===ORIGIN&&url.pathname==='/participation.css'){await route.fulfill({contentType:'text/css',body:css});return;}
  if(url.origin!==ORIGIN||!/^\/api\/(auth\/member|circles(?:\/start|\/[0-9a-f-]+)?|great-books\/text\/[a-z-]+)$/.test(url.pathname)){unexpected.push(url.origin+url.pathname);await route.abort();return;}
  const headers=await req.allHeaders();assert.equal(headers.cookie,undefined);assert.equal(headers.apikey,undefined);if(url.pathname.startsWith('/api/great-books/'))assert.equal(headers.authorization,undefined);if(cookie)headers.cookie=cookie;
  const entry={path:url.pathname+url.search,method:req.method(),body:req.postData()??null,expectedMember:headers['x-soe-expected-member']??null,status:null};http.push(entry);
  if(hold&&entry.method==='POST'){hold=false;let release;const wait=new Promise(resolve=>{release=resolve;});held={release,done:false,entry};await wait;}
  let response=before?await before({entry,headers}):null;
  response??=await fixture.dispatch(entry.path,{method:entry.method,headers,body:req.postData()??undefined});
  if(after)response=await after({entry,response});entry.status=response.status;if(held?.entry===entry)held.done=true;
  await route.fulfill({status:response.status,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:await response.text()});
 }catch(error){errors.push(error.stack||String(error));try{await route.abort();}catch{}}});
 await p.goto(ORIGIN);await p.waitForFunction(()=>window.hostingQa);
 const button=name=>p.getByRole('button',{name,exact:true}),text=()=>p.locator('body').innerText(),posts=()=>http.filter(row=>row.method==='POST');
 const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const enabled=name=>p.waitForFunction(name=>[...document.querySelectorAll('button')].some(node=>node.textContent===name&&!node.disabled),name);
 const startDate=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 async function release(){if(!held)return;held.release();await bounded(async()=>{while(!held.done)await new Promise(resolve=>setTimeout(resolve,10));});held=null;}
 async function show({preserve=false,who='author',context:readingContext,invalidContext=false,onlinePreset=false}={}){
  await release();hold=false;before=null;after=null;cookie=null;await p.evaluate(()=>window.hostingQa.unmount());await settle();
  if(!preserve){await fixture.close();fixture=await createCircleHostingApp();}
  await p.evaluate(value=>window.hostingQa.show(value),{token:who==='anonymous'?'':TOKENS[who],context:readingContext,invalidContext,onlinePreset});await enabled('Check hosting access');await settle();
 }
 async function load(){await button('Check hosting access').click();await enabled('Check hosting access');}
 async function fill({title='Web hosting proof Circle',format='in_person'}={}){
  await p.getByLabel('Circle name',{exact:true}).fill(title);
  await p.getByRole('radio',{name:format==='online'?'Online':format==='hybrid'?'Both':'In person',exact:true}).check();
  if(format!=='online'){await p.getByLabel('Venue name',{exact:true}).fill('Public library');await p.getByLabel('City',{exact:true}).fill('Boston');}
  if(format!=='in_person')await p.getByLabel('Private video link (https)',{exact:true}).fill('https://meeting.example.test/private-room');
  await p.getByLabel('First week starts',{exact:true}).fill(startDate);await p.getByLabel('Time zone',{exact:true}).selectOption('UTC');
  await p.getByRole('checkbox',{name:/I will use a public venue for in-person meetings/}).check();
 }
 async function review(){await button('Review my Circle listing').click();await p.getByRole('heading',{name:'Review your Circle listing',exact:true}).waitFor();}
 async function confirm(retry=false){await p.getByRole('checkbox',{name:/I checked the public listing/}).check();await button(retry?'Confirm exact Circle creation retry':'Confirm and list my Circle').click();await enabled('Close hosting view');}
 async function retry(){await load();await button('Review exact Circle creation retry').click();await confirm(true);}
 const rows=async(who='author')=>(await fixture.db.query('SELECT id,title,circle_reading_program,created_by FROM book_cohorts WHERE created_by=$1 ORDER BY id',[fixture.actors[who]])).rows;
 const createdLink=()=>p.getByRole('link',{name:'Open my Circle',exact:true});
 const createdId=async()=>String(await createdLink().getAttribute('href')).split('/').at(-1);
 async function currentWalletCookie(who) {
  const intent=crypto.randomUUID();
  return await fixture.walletCookie(who)+'; soe_auth_intent='+intent+'; soe_auth_selection_v1=v1.'+intent+'.wallet.'+fixture.actors[who];
 }

 await show();const mountAt=http.length;await settle();assert.equal(http.length,mountAt);assert.equal(await p.getByLabel('Circle name',{exact:true}).count(),0);
 pass('mounting the actual hosting form makes no identity, hosting, metadata or create request and exposes no private draft');
 await load();await fill();const reviewAt=http.length,postAt=posts().length;await review();assert.equal(http.length,reviewAt+2);assert.equal(posts().length,postAt);assert.equal(await button('Confirm and list my Circle').isDisabled(),true);assert.match(await text(),/First meeting \d{4}-\d{2}-\d{2}/);assert.match(await text(),/twelve-week starter path/);
 await p.screenshot({path:path.join(ROOT,'verification/web/evidence/circle-hosting-web-review-320'+suffix+'.png'),fullPage:true});await confirm();await createdLink().waitFor();
 let created=await createdId(),payload=JSON.parse(posts().at(-1).body),stored=await rows();assert.equal(stored.length,1);assert.equal(stored[0].id,created);assert.equal(payload.expectedMemberId,fixture.authorId);assert.equal(posts().at(-1).expectedMember,fixture.authorId);assert.equal(payload.readingProgram,undefined);assert.equal(http.at(-1).path,`/api/circles/${created}`);assert.equal(http.at(-1).expectedMember,fixture.authorId);
 const host=(await fixture.db.query('SELECT member_id FROM book_cohort_members WHERE cohort_id=$1',[created])).rows;assert.deepEqual(host.map(x=>x.member_id),[fixture.authorId]);
 pass('starter creation freshly checks canonical actor and owner-bound hosting access at review and confirm, requires explicit checkbox confirmation, creates one host/member atomically and exposes the Circle only after owned receipt plus current detail');

 await show({onlinePreset:true});await load();
 assert.equal(await p.getByRole('radio',{name:'Online',exact:true}).isChecked(),true);
 assert.equal(await p.getByLabel('Venue name',{exact:true}).count(),0);
 const meeting='https://meeting.example.test/private-room';
 const meetingField=p.getByLabel('Private video link (https)',{exact:true});
 await meetingField.fill(meeting);await button('Clear Circle draft').click();
 assert.equal(await meetingField.inputValue(),'');
 assert.equal(await p.getByRole('radio',{name:'Online',exact:true}).isChecked(),true);
 await fill({title:'Philemon remote salon',format:'online'});await review();
 assert.equal(await button('Confirm and list my Circle').isDisabled(),true);
 await confirm();await createdLink().waitFor();
 const remoteId=await createdId(),remotePath='/api/circles/'+remoteId,remotePayload=JSON.parse(posts().at(-1).body);
 assert.equal(remotePayload.format,'online');assert.equal(remotePayload.onlineUrl,meeting);assert.equal(remotePayload.venueName,null);
 const readerHeaders={Authorization:'Bearer '+TOKENS.other};
 async function remoteDetail(headers) {
  const response=await fixture.dispatch(remotePath,{headers});
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);
  return response.json();
 }
 assert(!JSON.stringify(await remoteDetail()).includes(meeting));
 let reader=await remoteDetail(readerHeaders);assert(!JSON.stringify(reader).includes(meeting));
 async function remoteMembership(action,expectedRevision) {
  const response=await fixture.dispatch(remotePath+'/'+action,{method:'POST',headers:readerHeaders,body:{requestId:crypto.randomUUID(),expectedRevision}});
  assert.equal(response.status,200);
 }
 await remoteMembership('join',reader.revision);
 reader=await remoteDetail(readerHeaders);assert.equal(reader.online_url,meeting);
 await remoteMembership('leave',reader.revision);
 assert(!JSON.stringify(await remoteDetail(readerHeaders)).includes(meeting));
 pass('the online preset clears a private draft, requires deliberate creation, and limits the meeting link to a currently joined participant');

 await show();await load();await fill({format:'hybrid'});await p.getByLabel('Reading plan',{exact:true}).selectOption('book');await p.getByLabel('Book and pinned source edition',{exact:true}).selectOption('hamlet');const metadataAt=http.length;
 await button('Load and verify selected edition').click();await p.getByLabel('Week 1 begins at reading position',{exact:true}).waitFor();assert.equal(http.length,metadataAt+1);assert.equal(http.at(-1).path,'/api/great-books/text/hamlet');assert.equal(http.at(-1).expectedMember,null);
 await p.getByLabel('Week 1 begins at reading position',{exact:true}).fill('42');await p.getByLabel('Week 1 ends at reading position',{exact:true}).fill('43');await button('Add weekly reading').click();await p.getByLabel('Week 2 begins at reading position',{exact:true}).fill('1');await p.getByLabel('Week 2 ends at reading position',{exact:true}).fill('2');await review();assert.match(await text(),/Project Gutenberg/);assert.match(await text(),/private-room/);await confirm();await createdLink().waitFor();created=await createdId();payload=JSON.parse(posts().at(-1).body);assert.equal(payload.format,'hybrid');assert.deepEqual(payload.readingProgram.sessions,[{from:41,to:42},{from:0,to:1}]);assert.equal(payload.readingProgram.bookId,'hamlet');assert.deepEqual(JSON.parse(JSON.stringify((await rows())[0].circle_reading_program)),payload.readingProgram);
 let publicDetail=await fixture.dispatch(`/api/circles/${created}`),publicValue=await publicDetail.json();assert.equal(publicDetail.status,200);assert(!JSON.stringify(publicValue).includes('private-room'));const privateRow=(await fixture.db.query('SELECT online_url FROM circle_private WHERE cohort_id=$1',[created])).rows[0];assert.equal(privateRow.online_url,payload.onlineUrl);
 pass('custom hybrid creation verifies actual materialized Hamlet metadata anonymously, preserves exact edition, source credits and intentionally revisited weekly positions, and keeps the meeting URL out of canonical anonymous detail');

 await show();await load();await fill();const oldReview=await p.evaluate(()=>window.hostingQa.retain('Review my Circle listing','onSubmit'));await p.getByLabel('Circle name',{exact:true}).fill('Current edited draft');const draftAt=http.length;await p.evaluate(id=>window.hostingQa.invoke(id),oldReview);await settle();assert.equal(http.length,draftAt);assert.equal(await p.getByRole('heading',{name:'Review your Circle listing',exact:true}).count(),0);await review();assert.match(await text(),/Current edited draft/);await button('Edit Circle details').click();const beforeCancel=posts().length;await p.getByLabel('Circle name',{exact:true}).fill('Edited reviewed listing');await review();assert.equal(posts().length,beforeCancel);assert.match(await text(),/Edited reviewed listing/);await button('Edit Circle details').click();await button('Clear Circle draft').click();assert.equal(await p.getByLabel('Circle name',{exact:true}).inputValue(),'');
 pass('a retired Review callback cannot use older raw fields; editing and clearing an unsent listing never create a Circle and require a new current-access review');

 await show();await load();await fill({format:'online'});await review();hold=true;await p.getByRole('checkbox',{name:/I checked the public listing/}).check();await button('Confirm and list my Circle').click();await bounded(async()=>{while(!held)await new Promise(resolve=>setTimeout(resolve,10));});
 // The click is waiting on a held request, so expire the trusted view deadline.
 await p.evaluate(()=>window.hostingQa.expire());await enabled('Check hosting access');const exact=posts().at(-1).body;assert.equal((await rows()).length,0);await load();assert.match(await text(),/still uncertain/);assert.equal(await p.getByLabel('Circle name',{exact:true}).count(),0);assert.equal((await rows()).length,0);
 await button('Review exact Circle creation retry').click();await button('Cancel creation retry review').click();assert.match(await text(),/still uncertain/);await button('Review exact Circle creation retry').click();await confirm(true);await createdLink().waitFor();assert.equal((await rows()).length,1);assert.equal(posts().at(-1).body,exact);await release();assert.equal((await rows()).length,1);
 pass('a creation held before SQL stays unknown after an unchanged hosting count; only cancellable exact retry review is offered, and retry plus later original delivery create exactly one Circle');

 await show();await load();await fill();await review();hold=true;await p.getByRole('checkbox',{name:/I checked the public listing/}).check();await button('Confirm and list my Circle').click();await bounded(async()=>{while(!held)await new Promise(resolve=>setTimeout(resolve,10));});await p.evaluate(()=>window.hostingQa.expire());await enabled('Check hosting access');const refusedBody=posts().at(-1).body;
 before=({entry})=>entry.method==='POST'?Response.json({error:'Synthetic rejected delivery'},{status:400}):null;await retry();assert.match(await text(),/may have been created/);assert.equal(posts().at(-1).body,refusedBody);before=null;await retry();await createdLink().waitFor();await release();assert.equal((await rows()).length,1);
 pass('a refused exact retry cannot settle an older held creation; its original actor, key and bytes remain available for a later explicit successful retry');

 for(const kind of ['blur','offline']){
  await show();await load();await fill({format:'online'});await review();hold=true;await p.getByRole('checkbox',{name:/I checked the public listing/}).check();await button('Confirm and list my Circle').click();await bounded(async()=>{while(!held)await new Promise(resolve=>setTimeout(resolve,10));});
  await p.evaluate(kind=>kind==='blur'?window.hostingQa.activity(false):window.hostingQa.network(false),kind);await settle();assert(!String(await text()).includes('private-room'));assert.equal(await button('Review exact Circle creation retry').count(),0);const at=http.length;await p.evaluate(()=>{window.hostingQa.network(true);window.hostingQa.activity(true);});await settle();assert.equal(http.length,at);await retry();await createdLink().waitFor();await release();assert.equal((await rows()).length,1);
 }
 pass('blur and offline clear visible private URLs, drafts and confirmations while keeping only hidden unresolved bytes; return is inert until same-owner proof and a new explicit retry review');

 await show();await load();await fill();await review();await p.getByRole('checkbox',{name:/I checked the public listing/}).check();const oldConfirm=await p.evaluate(()=>window.hostingQa.retain('Confirm and list my Circle')),oldEdit=await p.evaluate(()=>window.hostingQa.retain('Edit Circle details'));await button('Edit Circle details').click();await p.getByLabel('Circle name',{exact:true}).fill('Newer listing intent');await review();const staleAt=http.length;await p.evaluate(ids=>ids.forEach(id=>window.hostingQa.invoke(id)),[oldConfirm,oldEdit]);await settle();assert.equal(http.length,staleAt);assert.match(await text(),/Newer listing intent/);assert.equal(await button('Confirm and list my Circle').isDisabled(),true);await confirm();await createdLink().waitFor();assert.equal((await rows())[0].title,'Newer listing intent');
 pass('retained actual Confirm and Edit callbacks from an old listing cannot submit or dismiss a newer unconfirmed review');

 await show();await load();await fill();const oldInput=await p.evaluate(()=>window.hostingQa.retain('circle-title','onChange'));await button('Clear Circle draft').click();const editAt=http.length;await p.evaluate(id=>window.hostingQa.invoke(id,{target:{value:'Retired input'}}),oldInput);await settle();assert.equal(await p.getByLabel('Circle name',{exact:true}).inputValue(),'');assert.equal(http.length,editAt);
 await fill();await review();await p.getByRole('checkbox',{name:/I checked the public listing/}).check();const retiredConfirm=await p.evaluate(()=>window.hostingQa.retain('Confirm and list my Circle'));await p.evaluate(token=>window.hostingQa.identity(token),TOKENS.other);await settle();const ownerAt=http.length;await p.evaluate(id=>window.hostingQa.invoke(id),retiredConfirm);await settle();assert.equal(http.length,ownerAt);assert.equal(await p.getByRole('heading',{name:'Review your Circle listing',exact:true}).count(),0);
 pass('clearing a draft and identity retirement invalidate retained real input and confirmation callbacks without new edits or network calls');

 await show();await load();await fill();await review();const silentAt=posts().length;await p.evaluate(token=>window.hostingQa.token(token),TOKENS.other);await confirm();assert.equal(posts().length,silentAt);assert.match(await text(),/could not be verified/);await load();await fill({title:'Other canonical owner Circle'});await review();await confirm();await createdLink().waitFor();assert.equal((await rows()).length,0);assert.equal((await rows('other')).filter(row=>row.title==='Other canonical owner Circle').length,1);
 pass('fresh proof detects a silent A-to-B credential change before POST; only a new B-owned check, draft and review can create B’s listing');

 await show();await load();await fill();await review();before=({entry,headers})=>{if(entry.method==='POST')headers.authorization='Bearer '+TOKENS.other;return null;};await confirm();assert.equal(posts().at(-1).status,409);assert.equal((await rows()).length,0);assert.equal(await createdLink().count(),0);before=null;
 pass('the actual canonical server rejects an actor change after proof using both expected-member header and required owner body');

 await show({who:'anonymous'});cookie=await fixture.walletCookie('author');await load();
 assert.equal(http.at(-1).status,401);assert.equal(await p.getByLabel('Circle name',{exact:true}).count(),0);
 cookie=await currentWalletCookie('author');await load();await fill();await review();
 before=async({entry,headers})=>{if(entry.method==='POST')headers.cookie=await currentWalletCookie('other');return null;};
 await confirm();assert.equal(posts().at(-1).status,409);assert.equal((await rows()).length,0);
 before=null;await load();await fill();await review();await confirm();await createdLink().waitFor();assert.equal((await rows()).length,1);
 pass('actual signed synthetic wallet-cookie hosting remains supported, and a cookie switch between proof and POST cannot create a Circle for the wrong account');

 await show();await load();await fill();await review();after=({entry,response})=>entry.method==='POST'?Response.json({error:'Synthetic lost reply'},{status:503}):response;await confirm();assert.equal((await rows()).length,1);assert.equal(await createdLink().count(),0);after=null;await load();assert.match(await text(),/still uncertain/);await button('Review exact Circle creation retry').click();await confirm(true);await createdLink().waitFor();assert.equal((await rows()).length,1);
 pass('a committed creation with a lost reply remains uncertain even when hosting count rises; only its exact owned receipt and fresh Circle readback confirm it');

 for(const tamper of ['owner','key','readback']){
  await show();await load();await fill();await review();after=async({entry,response})=>{if(tamper==='readback'&&/^\/api\/circles\/[0-9a-f-]+$/.test(entry.path))return Response.json({error:'Unavailable current Circle'},{status:503});if(entry.method!=='POST'||![200,201].includes(response.status))return response;const value=await response.json();if(tamper==='owner')value.memberId=fixture.actors.other;if(tamper==='key')value.requestId='99999999-9999-4999-8999-999999999999';return Response.json(value,{status:response.status});};await confirm();assert.equal((await rows()).length,1);assert.equal(await createdLink().count(),0);assert.match(await text(),/may have been created/);after=null;await retry();await createdLink().waitFor();assert.equal((await rows()).length,1);
 }
 pass('wrong-owner or wrong-key creation replies and unavailable fresh detail never expose a false saved listing; the exact recovery request still settles through current canonical handlers');

 await show();await load();await fill();await review();const oldLoad=await p.evaluate(()=>window.hostingQa.retain('Check hosting access'));await p.evaluate(()=>window.hostingQa.network(false));await settle();const onlineAt=http.length;await p.evaluate(()=>window.hostingQa.network(true));await settle();await p.evaluate(id=>window.hostingQa.invoke(id),oldLoad);await settle();assert.equal(http.length,onlineAt);assert.equal(await p.getByLabel('Circle name',{exact:true}).count(),0);
 pass('an unsent private listing clears on offline retirement, and a retained pre-retirement access callback cannot restart it');

 await show();await load();await fill();await p.getByLabel('Reading plan',{exact:true}).selectOption('book');await p.getByLabel('Book and pinned source edition',{exact:true}).selectOption('hamlet');after=async({entry,response})=>{if(!entry.path.startsWith('/api/great-books/text/'))return response;const value=await response.json();value.edition.editionId='unreviewed-edition';value.edition.documentUrl='/api/great-books/edition/hamlet?edition=unreviewed-edition';value.edition.downloadUrl='/api/great-books/edition/hamlet/download?edition=unreviewed-edition';return Response.json(value);};await button('Load and verify selected edition').click();await enabled('Load and verify selected edition');assert.match(await text(),/could not be verified/);await button('Review my Circle listing').click();assert.equal(await p.getByRole('heading',{name:'Review your Circle listing',exact:true}).count(),0);assert.match(await text(),/Load and verify a pinned edition/);after=null;
 pass('a changed source edition is refused by the actual reading editor, and an unverified custom plan cannot reach creation review');

 const edition=fixture.app.load('lib/circles/reading-program.ts').getReadingEdition('hamlet');await show({context:{bookId:'hamlet',editionId:edition.editionId,from:41,to:41}});await load();assert.equal(await p.getByLabel('Reading plan',{exact:true}).inputValue(),'starter');await button('Use the reader selection as the first reading').click();await button('Load and verify selected edition').click();await p.getByLabel('Week 1 begins at reading position',{exact:true}).waitFor();assert.equal(await p.getByLabel('Week 1 begins at reading position',{exact:true}).inputValue(),'42');assert.equal(await p.getByLabel('Week 1 ends at reading position',{exact:true}).inputValue(),'42');await fill();await review();await confirm();await createdLink().waitFor();assert.deepEqual(JSON.parse(posts().at(-1).body).readingProgram.sessions,[{from:41,to:41}]);
 pass('a reader selection remains an unused hint until explicitly adopted and verified against real edition metadata, then its exact source coordinate is persisted');

 await show({who:'anonymous'});await load();assert.equal(await p.getByLabel('Circle name',{exact:true}).count(),0);assert.equal(http.at(-1).path,'/api/auth/member');assert.match(await text(),/Check your sign-in/);
 await show();await load();await fill();after=async({entry,response})=>{if(entry.path!=='/api/circles/start')return response;const value=await response.json();value.memberId=fixture.actors.other;return Response.json(value);};await button('Review my Circle listing').click();await enabled('Check hosting access');assert.equal(await p.getByRole('heading',{name:'Review your Circle listing',exact:true}).count(),0);assert.equal(await createdLink().count(),0);after=null;
 pass('missing canonical membership and a mismatched owner on hosting eligibility both refuse private review without a create request');

 await show();await load();await fill({format:'online'});await review();hold=true;await p.getByRole('checkbox',{name:/I checked the public listing/}).check();await button('Confirm and list my Circle').click();await bounded(async()=>{while(!held)await new Promise(resolve=>setTimeout(resolve,10));});
 await p.evaluate(token=>window.hostingQa.identity(token),TOKENS.other);await settle();assert(!String(await text()).includes('private-room'));await load();assert.equal(await button('Review exact Circle creation retry').count(),0);assert.match(await text(),/may still be created for the earlier account/);await fill({title:'New owner independent listing'});await review();await confirm();await createdLink().waitFor();const newerCircle=await createdId();await release();await settle();assert.equal(await createdId(),newerCircle);assert.equal((await rows()).length,1);assert.equal((await rows('other')).filter(row=>row.id===newerCircle).length,1);
 pass('when a held A creation outlives an account change, B cannot see or retry A’s private payload; late A delivery creates only A’s Circle and cannot replace B’s newly confirmed view');

 await show();await load();await fill();await review();for(let i=0;i<3;i++){const body=await fixture.createBody({title:'Concurrent hosting quota '+i});const response=await fixture.dispatch('/api/circles',{method:'POST',headers:{authorization:'Bearer '+TOKENS.author,origin:ORIGIN,'content-type':'application/json','x-soe-expected-member':fixture.authorId},body:JSON.stringify(body)});assert.equal(response.status,200);}
 const quotaAt=posts().length;await confirm();assert.equal(posts().length,quotaAt);assert.equal((await rows()).length,3);assert.equal(await createdLink().count(),0);assert.match(await text(),/Active and recent creation limits are checked separately/);
 pass('concurrent creations exhausting quota after review are detected by fresh owner-bound eligibility at confirmation before this listing sends a POST');

 await show();await load();await fill({format:'online'});after=({entry,response})=>entry.path==='/api/auth/member'?Response.json({error:'Unavailable actor'},{status:401}):response;await load();assert.equal(await p.getByLabel('Circle name',{exact:true}).count(),0);assert(!String(await text()).includes('private-room'));after=null;await load();assert.equal(await p.getByLabel('Circle name',{exact:true}).inputValue(),'');assert.equal(await p.getByRole('radio',{name:'In person',exact:true}).isChecked(),true);await fill({format:'online'});await p.evaluate(token=>window.hostingQa.token(token),TOKENS.other);await load();assert.equal(await p.getByLabel('Circle name',{exact:true}).inputValue(),'');assert.equal(await p.getByRole('radio',{name:'In person',exact:true}).isChecked(),true);
 pass('a fresh 401 or silently changed canonical owner clears the unsent private draft, and a later successful canonical check cannot restore its name or meeting URL');

 await show();await load();await fill();await review();after=({entry,response})=>entry.method==='POST'?Response.json({error:'Lost committed response'},{status:503}):response;await confirm();after=null;const oldClose=await p.evaluate(()=>window.hostingQa.retain('Close hosting view'));await button('Close hosting view').click();assert.match(await text(),/may still complete/);assert.match(await text(),/absence does not cancel/);await load();await fill({title:'Deliberately separate listing'});await review();const closeAt=http.length;await p.evaluate(id=>window.hostingQa.invoke(id),oldClose);await settle();assert.equal(http.length,closeAt);assert.match(await text(),/Deliberately separate listing/);assert.equal(await button('Confirm and list my Circle').isDisabled(),true);await confirm();await createdLink().waitFor();assert.equal((await rows()).length,2);
 pass('explicit terminal close discloses that a sent creation can still complete and discards recovery deliberately; its retired Close callback cannot dismiss a newly reviewed separate listing');

 await show();await load();await fill();await review();await confirm();await createdLink().waitFor();await p.screenshot({path:path.join(ROOT,'verification/web/evidence/circle-hosting-web-created-320'+suffix+'.png'),fullPage:true});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.evaluate(()=>window.hostingQa.unmount());await settle();stats=await p.evaluate(()=>window.hostingQa.stats());assert.deepEqual(stats,{subscriptions:0,deadlines:0,callbacks:0});assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(read(name)),hash,'Source changed during proof '+name);
 pass('320px rendered controls do not overflow; terminal unmount clears subscriptions, deadlines and retained callbacks with no browser errors or unexpected requests');
}catch(error){failure=error.stack||String(error);console.error(failure);}
finally{try{held?.release();if(browser)await browser.close();cleanup.browser='closed';}catch(error){cleanup.browser=String(error);}try{if(fixture)await fixture.close();cleanup.database='closed';}catch(error){cleanup.database=String(error);}write(failure?'FAIL':'PASS');}
if(failure)process.exitCode=1;
