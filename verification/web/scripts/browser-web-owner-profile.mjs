import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),output='verification/web/evidence/web-owner-profile-browser.json',sha=b=>createHash('sha256').update(b).digest('hex');
function read(name){const file=path.resolve(ROOT,name),s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Unavailable source '+name);return fs.readFileSync(file);}
read('verification/web/tests/support/public-profile-app.mjs');
process.chdir(path.join(ROOT,'verification/web'));
const {createPublicProfileApp,publicProfileAppHashes,ORIGIN,TOKENS}=await import('../tests/support/public-profile-app.mjs');
const startedAt=new Date().toISOString(),stories=[],errors=[],unexpected=[],http=[],cleanup={browser:'pending',database:'pending'};
let browser,page,fixture,bundle,sourceHashes={},stats,failure=null,after=null,before=null,hold=false,held=null,cookie=null;
const write=status=>fs.writeFileSync(path.join(ROOT,output),JSON.stringify({status,startedAt,completedAt:new Date().toISOString(),stories,errors,unexpected,http,cleanup,sourceHashes,stats,failure,bundleSHA256:bundle?sha(bundle):null,
 scope:'Actual web ProfilePage/ProfileEditor and stylesheet in cached React/Chromium; actual canonical member, private/public profile handlers over current disposable SQL including accepted-intent revision barrier. Browser credentials/auth events, Next Link, provider identity and HTTP delivery are explicit doubles. Local held requests, response transformations, deadline callbacks and retained actual DOM React callbacks exercise adverse lifetimes. No real wallet, provider account, production SQL, native runtime or deployment; offloaded jsdom is not read.'},null,2)+'\n');
const pass=name=>{stories.push(name);write('RUNNING');console.log('PASS '+stories.length+': '+name);};
async function bounded(fn,ms=6000){let timer;try{return await Promise.race([fn(),new Promise((_,no)=>timer=setTimeout(()=>no(Error('Bounded operation timed out')),ms))]);}finally{clearTimeout(timer);}}
write('RUNNING');
try{
 assert(process.execArgv.some(value=>value.endsWith('/deny-build-network.cjs')),'Startup network guard required');
 const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json');read(require.resolve('playwright'));
 const executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';read(executablePath);
 bundle=read('verification/web/evidence/web-owner-profile-fixture/page.js');const css=read('verification/web/evidence/web-owner-profile-fixture/profile.css');
 sourceHashes={...JSON.parse(read('verification/web/evidence/web-owner-profile-fixture/source-manifest.json')).sourceHashes,...await publicProfileAppHashes(),
  'verification/web/scripts/browser-web-owner-profile.mjs':sha(read('verification/web/scripts/browser-web-owner-profile.mjs'))};
 for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(read(name)),hash,'Changed source '+name);
 fixture=await createPublicProfileApp();
 browser=await require('playwright').chromium.launch({headless:true,timeout:15000,executablePath,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 const context=await browser.newContext({viewport:{width:320,height:850}});page=await context.newPage();const p=page;p.setDefaultTimeout(6000);
 p.on('pageerror',error=>errors.push(error.stack||String(error)));p.on('console',message=>{if(message.type()==='error'&&!/^Failed to load resource: the server responded with a status of (400|401|403|404|409|413|429|503)/.test(message.text()))errors.push(message.text());});
 await context.route('**/*',async route=>{try{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===ORIGIN&&url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/profile.css"><body style="margin:0;background:#0a0a0a;font-family:system-ui,sans-serif"><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});return;}
  if(url.origin===ORIGIN&&url.pathname==='/page.mjs'){await route.fulfill({contentType:'text/javascript',body:bundle});return;}
  if(url.origin===ORIGIN&&url.pathname==='/profile.css'){await route.fulfill({contentType:'text/css',body:css});return;}
  if(url.origin!==ORIGIN||!/^\/api\/(auth\/member|members\/profile|explorer\/[0-9a-f-]+)$/.test(url.pathname)){unexpected.push(url.origin+url.pathname);await route.abort();return;}
  const headers=await req.allHeaders();assert.equal(headers.cookie,undefined);assert.equal(headers.apikey,undefined);if(url.pathname.startsWith('/api/explorer/'))assert.equal(headers.authorization,undefined);else if(cookie)headers.cookie=cookie;
  const entry={path:url.pathname+url.search,method:req.method(),body:req.postData()??null,expectedMember:headers['x-soe-expected-member']??null,status:null};http.push(entry);
  if(hold&&entry.method==='POST'){hold=false;let release;const wait=new Promise(resolve=>{release=resolve;});held={release,done:false,entry};await wait;}
  let response=before?await before({entry,headers}):null;
  response??=await fixture.dispatch(entry.path,{method:entry.method,headers,body:req.postData()??undefined});
  if(after)response=await after({entry,response});entry.status=response.status;if(held?.entry===entry)held.done=true;
  await route.fulfill({status:response.status,headers:{'content-type':'application/json','cache-control':'private, no-store'},body:await response.text()});
 }catch(error){errors.push(error.stack||String(error));try{await route.abort();}catch{}}});
 await p.goto(ORIGIN);await p.waitForFunction(()=>window.profileQa);
 const button=name=>p.getByRole('button',{name,exact:true}),text=()=>p.locator('body').innerText(),posts=()=>http.filter(row=>row.method==='POST');
 const settle=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const enabled=name=>p.waitForFunction(name=>[...document.querySelectorAll('button')].some(node=>node.textContent===name&&!node.disabled),name);
 async function release(){if(!held)return;held.release();await bounded(async()=>{while(!held.done)await new Promise(resolve=>setTimeout(resolve,10));});held=null;}
 async function show({preserve=false,who='author'}={}){
  await release();hold=false;before=null;after=null;cookie=null;await p.evaluate(()=>window.profileQa.unmount());await settle();
  if(!preserve){await fixture.close();fixture=await createPublicProfileApp();}
  await p.evaluate(value=>window.profileQa.show(value),{token:who==='anonymous'?'':TOKENS[who]});await enabled('Load your profile');await settle();
 }
 const field=name=>p.getByLabel(name,{exact:true}),row=async(who='author')=>fixture.profileRow(who);
 const settled=()=>p.waitForFunction(()=>[...document.querySelectorAll('button')].some(node=>['Load your profile','Check saved profile'].includes(node.textContent)&&!node.disabled));
 async function load(){await button(await button('Check saved profile').count()?'Check saved profile':'Load your profile').click();await settled();}
 async function edit(values){for(const[label,value]of Object.entries(values))await field(label).fill(value);}
 async function review(publish=false){await field('Who can see these profile fields?').selectOption(publish?'public':'private');await button('Review profile changes').click();await p.getByRole('region',{name:'Profile save review'}).waitFor();assert.equal(await p.locator('h2:focus').count(),1);}
 async function confirm(retry=false,publish=false){await button(retry?'Confirm retry of same profile save':publish?'Confirm save and publish profile':'Confirm save private profile').click();await settled();}
 async function saved(publish=false){await p.getByText(publish?'Saved and confirmed: your profile is published.':'Saved and confirmed: your profile is private.',{exact:true}).waitFor();}
 async function pending(publish=true){hold=true;await review(publish);await button(publish?'Confirm save and publish profile':'Confirm save private profile').click();await bounded(async()=>{while(!held)await new Promise(resolve=>setTimeout(resolve,10));});await p.evaluate(()=>window.profileQa.expire());await enabled('Check saved profile');}
 async function retry(){await load();await button('Review retry of same profile save').click();await confirm(true);}
 const retain=(label,property)=>p.evaluate(({label,property})=>window.profileQa.retain(label,property),{label,property});
 const invoke=(id,value)=>p.evaluate(({id,value})=>window.profileQa.invoke(id,value),{id,value});

 await show();const initialAt=http.length;await settle();assert.equal(http.length,initialAt);assert.equal(await field('Display name').count(),0);await load();assert.equal(http.at(-2).path,'/api/auth/member');assert.equal(http.at(-1).path,'/api/members/profile');assert.equal((await row()).profile_visibility,'private');
 pass('actual owner profile page mounts without requests or fields; explicit load crosses canonical member and owner handlers into current SQL and preserves private defaults');
 const base=(await row()).profile_revision;
 await edit({'Display name':'  Deliberate profile  ','About you':'Private\nbiography','Your field':'Research','What you are building':'Reading tool','What you are looking for':'Collaborators','Your philosophy':'Ask careful questions','Skills, separated by commas':'Reading, Coding'});
 const editAt=posts().length;await review();assert.equal(posts().length,editAt);await p.getByRole('region',{name:'Profile save review'}).getByText('Deliberate profile',{exact:true}).waitFor();await button('Cancel profile review').click();assert.equal(posts().length,editAt);assert.equal(await field('Display name').inputValue(),'  Deliberate profile  ');await review();await p.screenshot({path:path.join(ROOT,'verification/web/evidence/web-owner-profile-review-320.png'),fullPage:true});await confirm();await saved();let current=await row();assert.equal(current.profile_revision,base+1);assert.equal(current.display_name,'Deliberate profile');assert.equal(current.bio,'Private\nbiography');assert.equal(current.profile_visibility,'private');const request=JSON.parse(posts().at(-1).body);assert.equal(request.expectedMemberId,fixture.authorId);assert.deepEqual(Object.keys(request.patch),['displayName','bio','discipline','skills','projectDescription','seeking','philosophy','visibility']);assert.deepEqual(request.patch.skills,['Reading','Coding']);assert.equal(http.at(-2).path,'/api/auth/member');assert.equal(http.at(-1).path,'/api/members/profile');await load();assert.equal(await field('About you').inputValue(),'Private\nbiography');
 pass('all seven fields normalize into a complete owner/revision-bound review; cancel sends nothing, confirmation performs one CAS and separate fresh canonical proof/readback, and explicit reload proves persistence');
 const publicAt=http.length;await button('Check my public profile').click();await p.getByText('No public profile is visible at this address.',{exact:true}).waitFor();assert.equal(http.length,publicAt+1);assert.equal(http.at(-1).path,`/api/explorer/${fixture.authorId}`);assert.equal(http.at(-1).status,404);
 await review(true);assert.equal((await row()).profile_visibility,'private');await confirm(false,true);await saved(true);const pubAt=http.length;await button('Check my public profile').click();await p.getByText('The public profile returned these saved fields.',{exact:true}).waitFor();assert.equal(http.length,pubAt+1);assert.equal(await p.getByRole('link',{name:'View your published profile'}).getAttribute('href'),`/explorer/${fixture.authorId}`);await p.screenshot({path:path.join(ROOT,'verification/web/evidence/web-owner-profile-public-320.png'),fullPage:true});await review();await confirm();await saved();await button('Check my public profile').click();await p.getByText('No public profile is visible at this address.',{exact:true}).waitFor();assert.equal((await row()).bio,'Private\nbiography');
 pass('publication and unpublication each require distinct review/confirmation; explicit anonymous public checks expose only saved authored fields and reflect current SQL publication without provider or private requests');

 await show();await load();const heldBase=(await row()).profile_revision;await edit({'About you':'Held private detail'});await pending();const heldBody=posts().at(-1).body;assert.equal((await row()).profile_revision,heldBase);await load();assert.match(await text(),/unchanged profile does not prove/);assert.equal(await field('About you').count(),0);assert.equal(await button('Review profile changes').count(),0);await button('Review retry of same profile save').click();await button('Cancel profile review').click();assert.match(await text(),/remains uncertain/);await button('Review retry of same profile save').click();await confirm(true);await saved(true);assert.equal(posts().at(-1).body,heldBody);assert.equal((await row()).profile_revision,heldBase+1);await release();assert.equal((await row()).profile_revision,heldBase+1);assert.equal(http.filter(x=>x.method==='POST'&&x.body===heldBody).at(0).status,409);
 pass('an original public save held before SQL stays uncertain after same-base GET; no different edit is possible, and newly reviewed exact retry advances once while the late original conflicts');

 await show();await load();await edit({'About you':'Refused retry retains this request'});await pending();const refusedBody=posts().at(-1).body;before=({entry})=>entry.method==='POST'?Response.json({error:'Synthetic refusal'},{status:400}):null;await retry();assert.match(await text(),/may still complete/);assert.equal(posts().at(-1).body,refusedBody);before=null;await retry();await saved(true);await release();assert.equal((await row()).bio,'Refused retry retains this request');
 pass('a refused exact retry never clears an older uncertain save; only a later deliberate exact retry and matching receipt/readback settle it');


 await show();await fixture.updateProfile({visibility:'public',bio:'Already public biography'});await load();await edit({'About you':'Uncertain private replacement'});await pending(false);await load();await button('Check my public profile').click();await p.getByText('The public profile returned these saved fields.',{exact:true}).waitFor();assert.equal(await p.getByRole('link',{name:'View your published profile'}).count(),0);assert.equal(await field('About you').count(),0);await button('Review retry of same profile save').click();await confirm(true);await saved();await release();assert.equal((await row()).profile_visibility,'private');
 pass('an anonymous public self-check while an owner save is uncertain cannot unlock editing or profile navigation, discard recovery, or settle the earlier save');

 await show();await load();const noOpBase=(await row()).profile_revision;await review();after=({entry,response})=>entry.method==='POST'?Response.json({error:'Synthetic lost acknowledgement'},{status:503}):response;await confirm();assert.equal((await row()).profile_revision,noOpBase+1);assert.match(await text(),/may still complete/);after=null;const noOpPosts=posts().length;await load();assert.match(await text(),/newer saved profile prevents/);assert.equal(posts().length,noOpPosts);assert.equal(await field('Display name').isEnabled(),true);
 pass('even an accepted unchanged private save advances the canonical revision; a lost reply remains uncertain until explicit higher-revision recovery fences its old CAS without repeating the write');

 await show();await load();const restartBase=(await row()).profile_revision;await edit({'About you':'Old terminal public intent'});await pending();const oldHeld=held;await button('Close profile view').click();assert.match(await text(),/may still complete/);await p.evaluate(token=>window.profileQa.show({token}),TOKENS.author);await enabled('Load your profile');await load();await review();await confirm();await saved();assert.equal((await row()).profile_revision,restartBase+1);await release();assert.equal(oldHeld.entry.status,409);assert.equal((await row()).profile_visibility,'private');await button('Check my public profile').click();await p.getByText('No public profile is visible at this address.',{exact:true}).waitFor();
 pass('after terminal recovery discard, a newer explicitly confirmed unchanged private save still fences the older held publication at SQL; late delivery cannot publish the profile');

 for(const kind of ['blur','offline']){
  await show();await load();await edit({'About you':'Hidden pending profile text'});await pending();const body=posts().at(-1).body;await p.evaluate(kind=>kind==='blur'?window.profileQa.activity(false):window.profileQa.network(false),kind);await settle();assert(!String(await text()).includes('Hidden pending profile text'));assert.equal(await button('Review retry of same profile save').count(),0);const at=http.length;await p.evaluate(()=>{window.profileQa.network(true);window.profileQa.activity(true);});await settle();assert.equal(http.length,at);await retry();await saved(true);assert.equal(posts().at(-1).body,body);await release();
 }
 pass('blur and offline remove rendered private fields/reviews while retaining unresolved bytes only in memory; reconnect is inert and retry needs fresh same-owner proof and explicit review');

 await show();await load();await edit({'About you':'Unsubmitted secret'});const oldEdit=await retain('profile-bio','onChange'),oldReview=await retain('Review profile changes');await p.evaluate(()=>window.profileQa.activity(false));await settle();assert.equal(await field('About you').count(),0);await p.evaluate(()=>window.profileQa.activity(true));await load();const atRetired=http.length;await invoke(oldEdit,{target:{value:'STALE_FIELD'}});await invoke(oldReview);await settle();assert.equal(http.length,atRetired);assert.notEqual(await field('About you').inputValue(),'STALE_FIELD');assert.equal(await p.getByRole('region',{name:'Profile save review'}).count(),0);
 await edit({'About you':'First review'});await review();const oldConfirm=await retain('Confirm save private profile'),oldCancel=await retain('Cancel profile review');await button('Cancel profile review').click();await edit({'About you':'New review'});await review();const oldAt=http.length;await invoke(oldConfirm);await invoke(oldCancel);await settle();assert.equal(http.length,oldAt);await p.getByRole('region',{name:'Profile save review'}).getByText('New review',{exact:true}).waitFor();await confirm();await saved();assert.equal((await row()).bio,'New review');
 pass('actual retained field/Review callbacks after privacy retirement and Confirm/Cancel callbacks from an earlier review cannot edit, request, submit or dismiss the newer context');

 await show();await load();await edit({'About you':'A-only pending biography'});await pending();await p.evaluate(token=>window.profileQa.identity(token),TOKENS.other);await settle();assert(!String(await text()).includes('A-only pending biography'));await load();assert.match(await text(),/earlier account.s save may still complete/);assert.equal(await button('Review retry of same profile save').count(),0);assert.notEqual(await field('About you').inputValue(),'A-only pending biography');await release();assert.equal((await row()).bio,'A-only pending biography');assert.notEqual((await row('other')).bio,'A-only pending biography');
 pass('account selection retirement hides A recovery immediately; fresh B proof discards private A bytes with a may-complete notice, and late A delivery cannot alter B');

 await show();await load();await edit({'About you':'Silent-owner-change draft'});await review();const silentAt=posts().length;await p.evaluate(token=>window.profileQa.token(token),TOKENS.other);await confirm();assert.equal(posts().length,silentAt);assert.equal(await field('About you').count(),0);await load();assert.notEqual(await field('About you').inputValue(),'Silent-owner-change draft');
 pass('a silent selected credential switch is freshly detected before confirmation sends a profile mutation');

 await show();await load();await edit({'About you':'Actor changed after proof'});await review();before=({entry,headers})=>{if(entry.method==='POST')headers.authorization='Bearer '+TOKENS.other;return null;};await confirm();assert.equal(posts().at(-1).status,409);assert.notEqual((await row('other')).bio,'Actor changed after proof');assert.equal(await field('About you').count(),0);before=null;
 pass('the actual handler refuses a canonical actor switch after browser proof through the required expectedMemberId body, leaving the other member unchanged');


 await show({who:'anonymous'});cookie=await fixture.walletCookie('author');await load();await edit({'About you':'Signed wallet profile edit'});await review();before=async({entry,headers})=>{if(entry.method==='POST')headers.cookie=await fixture.walletCookie('other');return null;};await confirm();assert.equal(posts().at(-1).status,409);assert.notEqual((await row('other')).bio,'Signed wallet profile edit');before=null;await load();await edit({'About you':'Signed wallet profile edit'});await review();await confirm();await saved();assert.equal((await row()).bio,'Signed wallet profile edit');
 pass('actual signed synthetic wallet-cookie authority remains supported, and a cookie actor change between proof and POST cannot edit the wrong member');

 for(const tamper of ['owner','revision','fields','readback']){
  await show();await load();await edit({'About you':'Validate receipt exactly'});await review();const base=(await row()).profile_revision;after=async({entry,response})=>{
   if(tamper==='readback'&&entry.path==='/api/members/profile'&&entry.method==='GET')return Response.json({error:'Synthetic unavailable readback'},{status:503});
   if(entry.method!=='POST'||response.status!==200)return response;const value=await response.json();if(tamper==='owner')value.memberId=fixture.actors.other;if(tamper==='revision')value.revision=base;if(tamper==='fields')value.profile.bio='Unexpected receipt biography';return Response.json(value);
  };await confirm();assert.match(await text(),/may still complete/);assert.equal(await p.getByText('Saved and confirmed: your profile is private.',{exact:true}).count(),0);after=null;await load();assert.match(await text(),/newer saved profile prevents/);
 }
 pass('wrong-owner, unchanged-revision, mismatched-field receipts and failed fresh readback never confirm a save; higher current SQL state is recovered only by an explicit check');

 await show();await load();await edit({'About you':'Stale revision draft'});await review();await fixture.updateProfile({bio:'Concurrent authoritative profile'});await confirm();assert.equal(posts().at(-1).status,409);assert.equal((await row()).bio,'Concurrent authoritative profile');await load();assert.equal(await field('About you').inputValue(),'Concurrent authoritative profile');
 pass('a competing canonical profile save advances revision and rejects the stale reviewed edit without overwriting current fields');

 await show();await load();await review();await confirm();await saved();after=({entry,response})=>entry.path.startsWith('/api/explorer/')?Response.json({error:'different not-found shape'},{status:404}):response;await button('Check my public profile').click();await p.getByText('The public profile could not be checked. Its visibility has not been confirmed.',{exact:true}).waitFor();after=null;
 await fixture.updateProfile({visibility:'public',bio:'Public current field'});await load();after=async({entry,response})=>{if(!entry.path.startsWith('/api/explorer/')||response.status!==200)return response;const value=await response.json();value.profile.id=fixture.actors.other;return Response.json(value);};await button('Check my public profile').click();await p.getByText('The public profile could not be checked. Its visibility has not been confirmed.',{exact:true}).waitFor();assert.equal(await p.getByRole('link',{name:'View your published profile'}).count(),0);after=null;
 pass('public checks bind the exact requested member and strict response shape; malformed404 or another-member response cannot establish visibility or reveal a public link');


 await show();after=async({entry,response})=>{if(entry.path!=='/api/members/profile'||entry.method!=='GET'||response.status!==200)return response;const value=await response.json();value.memberId=fixture.actors.other;return Response.json(value);};await load();assert.equal(await field('Display name').count(),0);after=null;await load();await fixture.updateProfile({visibility:'public',bio:'Retired public response text'});await load();let releasePublic,publicHeld=false;const publicWait=new Promise(resolve=>{releasePublic=resolve;});after=async({entry,response})=>{if(entry.path.startsWith('/api/explorer/')){publicHeld=true;await publicWait;}return response;};await button('Check my public profile').click();await bounded(async()=>{while(!publicHeld)await new Promise(resolve=>setTimeout(resolve,10));});await p.evaluate(()=>window.profileQa.activity(false));await settle();releasePublic();await settle();assert(!String(await text()).includes('Retired public response text'));const publicReturnAt=http.length;await p.evaluate(()=>window.profileQa.activity(true));await settle();assert.equal(http.length,publicReturnAt);assert.equal(await field('Display name').count(),0);after=null;
 pass('owner GET responses must match the fresh canonical member; late anonymous profile responses after blur cannot restore retired fields and focus performs no fetch');

 await show();before=({entry})=>entry.path==='/api/auth/member'?Response.json({error:'Synthetic signed out'},{status:401}):null;const authAt=http.length;await load();assert.equal(http.length,authAt+1);assert.equal(await field('Display name').count(),0);before=null;await load();await edit({'About you':'Old DOM callback'});const closed=await retain('Close profile view'),fieldCb=await retain('profile-bio','onChange');await p.evaluate(token=>window.profileQa.show({token}),TOKENS.author);await enabled('Load your profile');await load();await edit({'About you':'New mounted draft'});const remountAt=http.length;await invoke(closed);await invoke(fieldCb,{target:{value:'OLD_EVENT'}});await settle();assert.equal(await field('About you').inputValue(),'New mounted draft');assert.equal(http.length,remountAt);
 pass('failed canonical proof never fetches profile fields, and callbacks retained from an unmounted editor cannot close or edit its replacement');

 await edit({'Display name':'Long published profile '.repeat(8)});await review(true);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert((await button('Confirm save and publish profile').boundingBox()).height>=44);await p.screenshot({path:path.join(ROOT,'verification/web/evidence/web-owner-profile-review-320.png'),fullPage:true});await confirm(false,true);await saved(true);await button('Check my public profile').click();await p.getByText('The public profile returned these saved fields.',{exact:true}).waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:path.join(ROOT,'verification/web/evidence/web-owner-profile-public-320.png'),fullPage:true});await button('Close profile view').click();assert.equal(await field('Display name').count(),0);await p.evaluate(()=>window.profileQa.unmount());await settle();stats=await p.evaluate(()=>window.profileQa.stats());assert.deepEqual(stats,{subscriptions:0,deadlines:0,callbacks:0});
 pass('full seven-field review and public projection fit320px with44px controls; terminal close/unmount clears private UI and all subscriptions, deadlines and retained callbacks');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(read(name)),hash,'Source changed during proof '+name);
}catch(error){failure=error.stack||String(error);console.error(failure);}
finally{
 try{if(held){held.release();await new Promise(resolve=>setTimeout(resolve,30));}if(page)await page.evaluate(()=>window.profileQa?.unmount()).catch(()=>{});if(browser)await browser.close();cleanup.browser='closed';}catch(error){cleanup.browser='failed';failure??=String(error);}
 try{if(fixture)await fixture.close();cleanup.database='closed';}catch(error){cleanup.database='failed';failure??=String(error);}
 try{assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const[name,hash]of Object.entries(sourceHashes))assert.equal(sha(read(name)),hash,'Source changed during cleanup '+name);}catch(error){failure??=error.stack||String(error);}write(failure?'FAIL':'PASS');
}
if(failure)process.exitCode=1;
