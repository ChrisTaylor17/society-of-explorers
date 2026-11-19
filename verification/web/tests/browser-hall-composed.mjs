// Actual frozen Hall component → actual GET → cached SDK → local service-role
// SQL on the sanitized fixture. HTTPS is virtual and fully intercepted.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHallDatabaseFixture} from './support/hall-db-http-fixture.mjs';
import {hallId} from './support/hall-http-fixture.mjs';
import {HALL_CATALOG_SHA256,HALL_SUPPLEMENT_SHA256,FIXTURE_EXCEPTIONS,ARTIFACT_IDS} from './support/artifact-containment-fixture.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url)),evidence=path.join(root,'verification/web/evidence');
const dir=path.join(evidence,'hall-fixture'),origin='https://hall-composed.test';
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'source-manifest.json'),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const files=[...Object.keys(manifest.sourceHashes),'app/api/hall/route.ts','lib/http/routeError.ts',
  ...['preflight','apply','rollback'].map(stage=>`docs/sql/artifact-containment-${stage}.sql`),
  'verification/web/tests/fixtures/hall-catalog-2026-11-04.json','verification/web/tests/fixtures/hall-catalog-supplement-2026-11-04.json',
  'verification/web/tests/support/artifact-containment-fixture.mjs','verification/web/tests/support/hall-db-http-fixture.mjs',
  'verification/web/tests/support/hall-http-fixture.mjs','verification/web/tests/browser-hall-composed.mjs','verification/web/scripts/deny-build-network.cjs'];
const sourceHashes=()=>Object.fromEntries(files.map(name=>[name,hash(fs.readFileSync(path.join(root,name)))]));
const beforeHashes=sourceHashes();
for(const[name,expected]of Object.entries(manifest.sourceHashes))assert.equal(beforeHashes[name],expected,'Re-bundle changed source: '+name);
const bundle=fs.readFileSync(path.join(dir,'page.js')),css=fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(name=>name.endsWith('.css'))));
assert.throws(()=>fetch('https://fixture.invalid/never-send'),/EXTERNAL_NETWORK_DISABLED_IN_PRIVATE_BUILD/);
const cleanup=[],f=await createHallDatabaseFixture({after:fn=>cleanup.push(fn)});
await f.db.query('INSERT INTO members(id,display_name) VALUES($1,$2)',[ARTIFACT_IDS.member,'PRIVATE_AUTHOR_IDENTITY']);
async function insert(n,{publication=true,thinker='plato',title=`Global Plato creation ${n}`,date='2029-01-01T00:00:00Z'}={}){
  await f.db.query(`INSERT INTO artifacts(id,member_id,thinker_id,title,description,philosophical_note,is_public,created_at,prompt_used,image_url,thumbnail_url,conversation_context)
    VALUES($1,$2,$3,$4,'Synthetic public text description.','Synthetic public philosophical note.',$5,$6,'PRIVATE_PROMPT','https://media.invalid/PRIVATE_IMAGE','PRIVATE_THUMBNAIL','PRIVATE_CONVERSATION')`,[hallId(n),ARTIFACT_IDS.member,thinker,title,publication,date]);
}
for(let n=1;n<=120;n++)await insert(n,{publication:n%2===0?false:null,title:'PRIVATE_PADDING',date:'2035-01-01T00:00:00Z'});
for(let n=201;n<=260;n++)await insert(n);
for(const[n,thinker]of [[701,'__proto__'],[702,'constructor'],[703,'toString']])await insert(n,{thinker,title:`Prototype-safe literal ${thinker}`,date:'2031-01-01T00:00:00Z'});
await insert(500,{thinker:'socrates',title:'Older global Socrates creation',date:'2020-01-01T00:00:00Z'});
const require=createRequire('/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/playwright/package.json'),{chromium}=require('playwright');
const requests=[],stories=[],errors=[],routeErrors=[],unexpected=[];
let failure=null,page;
const browser=await chromium.launch({headless:true,
  executablePath:'/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
try {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([{name:'synthetic_cookie_must_not_be_sent',value:'NONISSUED_FIXTURE_ONLY',url:origin}]);
  page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
    try {
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin){unexpected.push(url.origin+url.pathname);await route.abort();return;}
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"></head><body><div id="root"></div><script type="module" src="/page.mjs"></script></body></html>'});
      if(url.pathname==='/page.mjs')return route.fulfill({contentType:'text/javascript',body:bundle});
      if(url.pathname==='/page.css')return route.fulfill({contentType:'text/css',body:css});
      if(url.pathname!=='/api/hall'){unexpected.push(url.pathname);await route.abort();return;}
      assert.equal(request.method(),'GET');assert.equal(request.headers().cookie,undefined);assert.equal(request.headers().authorization,undefined);assert.equal(request.headers().referer,undefined);
      const response=await f.route.GET(new Request(request.url(),{headers:request.headers()}));
      const bytes=Buffer.from(await response.arrayBuffer()),body=JSON.parse(bytes.toString());
      assert.match(response.headers.get('cache-control'),/private.*no-store/);
      if(response.status===200){
        assert.deepEqual(Object.keys(body),['items','page']);assert.deepEqual(Object.keys(body.page),['limit','hasMore']);
        for(const item of body.items)assert.deepEqual(Object.keys(item),['id','thinker_id','title','description','philosophical_note']);
        assert.doesNotMatch(JSON.stringify(body),/PRIVATE_|member_id|image_url|thumbnail_url|prompt_used|conversation_context|theme|created_at|is_public/);
      }else{assert.equal(response.status,503);assert.deepEqual(body,{error:'Hall unavailable.'});}
      requests.push({thinker:url.searchParams.get('thinker'),status:response.status,items:body.items?.length??null,hasMore:body.page?.hasMore??null,
        cookieOmitted:true,bearerOmitted:true,referrerOmitted:true});
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:bytes});
    }catch(error){routeErrors.push(error.message);try{await route.abort();}catch{}}
  });
  const status=text=>page.getByRole('status').filter({hasText:text}).waitFor();
  const filter=async(name,label)=>{await page.getByRole('button',{name,exact:true}).click();await status('Public text view loaded for '+label+'.');};
  await page.goto(origin);await status('Public text view loaded for all thinkers.');
  assert.equal(await page.locator('article').count(),48);assert.equal(await page.getByText('Anonymous Explorer',{exact:true}).count(),48);
  for(const thinker of ['__proto__','constructor','toString']){
    const card=page.locator('article').filter({has:page.getByRole('heading',{name:`Prototype-safe literal ${thinker}`,exact:true})});
    await card.getByText(thinker,{exact:true}).waitFor();
  }
  assert.match(await page.getByRole('region',{name:'Public text creations'}).innerText(),/More creations exist/);
  assert.doesNotMatch(await page.locator('main').innerText(),/PRIVATE_|Older global Socrates creation/);
  assert.equal(await page.locator('img,video,audio,iframe,source').count(),0);
  assert.equal(f.authCalls,0);
  stories.push('Actual anonymous component GET → canonical handler → contained service SQL excludes120 newer private/null rows before49, renders latest48 of64 public rows with honest hasMore, handles three prototype-named unknown thinkers as literal labels, and exposes five text fields with no identity/media/auth requests');

  await filter('Socrates','Socrates');
  await page.getByRole('heading',{name:'Older global Socrates creation',exact:true}).waitFor();
  assert.equal(await page.locator('article').count(),1);
  assert.equal(requests.at(-1).thinker,'socrates');assert.equal(requests.at(-1).hasMore,false);
  assert.ok(f.queries.at(-1).includes('WHERE is_public=$1 AND thinker_id=$2 ORDER BY'));
  stories.push('Global Socrates filter executes the real database predicate before49 and finds its older public row behind sixty newer published artifacts of another thinker');

  await filter('Nietzsche','Nietzsche');
  await page.getByText('No public text creations are available for this selection.',{exact:true}).waitFor();
  assert.equal(requests.at(-1).status,200);assert.equal(requests.at(-1).items,0);
  await f.db.exec('REVOKE SELECT ON artifacts FROM service_role');
  await page.getByRole('button',{name:'Socrates',exact:true}).click();await status('Public creations are unavailable.');
  assert.equal(requests.at(-1).status,503);assert.equal(await page.locator('article').count(),0);
  assert.doesNotMatch(await page.locator('main').innerText(),/No public text creations|PRIVATE_SQL_DETAILS/);
  await f.db.exec('GRANT SELECT ON artifacts TO service_role');
  await page.getByRole('button',{name:'Retry loading creations',exact:true}).click();
  await page.getByRole('heading',{name:'Older global Socrates creation',exact:true}).waitFor();
  stories.push('A real zero-row SQL read yields the selection-specific empty state; a real service privilege failure becomes generic API503/UI unavailable, and restoring only the local fixture privilege permits explicit retry');

  await page.evaluate(()=>{window.hallQa.holdNextBody=true;});
  await page.getByRole('button',{name:'All minds',exact:true}).click();await page.waitForFunction(()=>window.hallQa.bodyHeld);
  assert.equal(await page.locator('article').count(),0);
  await filter('Socrates','Socrates');await page.getByRole('heading',{name:'Older global Socrates creation',exact:true}).waitFor();
  await page.evaluate(()=>window.hallQa.releaseBody());await page.waitForFunction(()=>!window.hallQa.bodyHeld);
  // Let the fulfilled older JSON continuation and its React state update turn run.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('article').count(),1);assert.equal(await page.getByRole('button',{name:'Socrates',exact:true}).getAttribute('aria-pressed'),'true');
  assert.doesNotMatch(await page.locator('main').innerText(),/Global Plato creation|PRIVATE_/);
  assert.equal(await page.locator('img,video,audio,iframe,source').count(),0);assert.equal(f.authCalls,0);
  assert.deepEqual(errors,[]);assert.deepEqual(routeErrors,[]);assert.deepEqual(unexpected,[]);
  stories.push('The older actual all-minds API body is held by the existing explicit nonabortable JSON adapter; changing filters loads the real Socrates result, and the late48-row body cannot replace it');
  await context.close();
}catch(error){failure=error.stack??String(error);throw error;}
finally {
  if(page&&!page.isClosed())try{await page.evaluate(()=>{if(window.hallQa.releaseBody)window.hallQa.releaseBody();});}catch{}
  await browser.close();for(const fn of cleanup.reverse())await fn();
  const afterHashes=sourceHashes(),unchanged=JSON.stringify(beforeHashes)===JSON.stringify(afterHashes);
  const report={status:failure||!unchanged?'FAIL':'PASS',failure,stories,requests,errors,routeErrors,unexpected,
    serviceSqlQueries:f.queries.length,authCalls:f.authCalls,providerCalls:0,mediaRequests:0,sourceUnchanged:unchanged,
    sourceHashesBefore:beforeHashes,sourceHashesAfter:afterHashes,bundleSHA256:hash(bundle),cssSHA256:hash(css),
    catalogSHA256:HALL_CATALOG_SHA256,supplementSHA256:HALL_SUPPLEMENT_SHA256,fixtureExceptions:FIXTURE_EXCEPTIONS,
    scope:'Actual frozen Hall React component/parser/CSS, canonical GET handler and cached Supabase URL builder, with narrow intercepted service-role SQL transport on the sanitized contained PGlite17.5 fixture. Existing NextLink and nonabortable JSON-body test adapters; controlled synthetic artifact rows and fixture privilege changes. No production/provider/auth/media request, real hosted PostgREST, full external member/merch/mint schemas, rights acceptance, deployment or multibackend concurrency proof.'};
  fs.writeFileSync(path.join(evidence,'hall-composed-browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,stories:stories.length,serviceSqlQueries:report.serviceSqlQueries,sourceUnchanged:unchanged,receipt:'verification/web/evidence/hall-composed-browser.json'}));
  if(!unchanged)process.exitCode=1;
}
