import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const ROOT=process.cwd(),PREFIX='verification/web/evidence/web-login-baseline',ORIGIN='https://web-login.test',PROVIDER='https://web-login-provider.test';
const TOKEN='PRIVATE_BASELINE_ACCESS_TOKEN',REFRESH='PRIVATE_BASELINE_REFRESH_TOKEN',EMAIL='PRIVATE_BASELINE_EMAIL@example.invalid',PASSWORD='PRIVATE_BASELINE_PASSWORD_42';
const SUBJECT='11111111-1111-4111-8111-111111111111',secrets=[TOKEN,REFRESH,EMAIL,PASSWORD];
const sha=b=>createHash('sha256').update(b).digest('hex');
function read(name){const p=path.isAbsolute(name)?name:path.join(ROOT,name),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&(!s.size||s.blocks),'Unavailable input');return fs.readFileSync(p);}
const redact=value=>secrets.reduce((v,s)=>v.split(s).join('[redacted]'),String(value));
const result={status:'RUNNING',startedAt:new Date().toISOString(),observations:[],requests:[],errors:[],sourceHashes:{},runtimeHashes:{},servedHashes:{},cleanup:{browser:'pending'},scope:'Historical reproduction using unmodified actual LoginPage, PublicNav/Footer, createBrowserClient SSR0.9.0 and cached supabase-js/AuthClient2.99.3. Router is a navigation recorder; delivery/provider credentials are synthetic. Actual canonical provider and member HTTP handlers execute through offlineApp with explicit framework/SSR identity doubles; provider lower identity derives only from the actual SDK-written synthetic cookie token. No real provider, account, mail, wallet signing, Google OAuth, production SQL, deployed Next or acceptance claim.'};
const write=()=>{const text=JSON.stringify(result,null,2)+'\n';for(const secret of secrets)assert(!text.includes(secret),'Private evidence');fs.writeFileSync(path.join(ROOT,PREFIX+'.json'),text);};
const observe=text=>{result.observations.push(text);write();console.log('REPRODUCED '+result.observations.length+': '+text);};
let browser,page,context,releaseToken=null,held=false,cookieUser=null;
write();
try{
 assert(process.execArgv.some(v=>v.endsWith('/deny-build-network.cjs')));
 const manifest=JSON.parse(read(PREFIX+'-fixture/source-manifest.json'));
 Object.assign(result.sourceHashes,manifest.sourceHashes);Object.assign(result.runtimeHashes,manifest.runtimeHashes);
 for(const n of ['page.js','page.css','source-manifest.json'])result.servedHashes[PREFIX+'-fixture/'+n]=sha(read(PREFIX+'-fixture/'+n));
 for(const n of ['verification/web/tests/browser-web-login-baseline.mjs','verification/web/tests/support/offline-app.mjs','tests/security/fakes.ts','verification/web/scripts/deny-build-network.cjs'])result.sourceHashes[n]=sha(read(n));
 const seen=new Set();
 function bind(name){if(seen.has(name))return;seen.add(name);const bytes=read(name);result.sourceHashes[name]=sha(bytes);if(!/\.tsx?$/.test(name))return;
  for(const m of bytes.toString().matchAll(/(?:import|export)[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){const spec=m[1];if(!spec.startsWith('.')&&!spec.startsWith('@/'))continue;if(['@/lib/supabase/server','@/lib/supabase/admin'].includes(spec))continue;const p=spec.startsWith('@/')?spec.slice(2):path.join(path.dirname(name),spec);const n=['', '.ts','.tsx','.json'].map(ext=>p+ext).find(n=>fs.existsSync(path.join(ROOT,n)));assert(n);bind(n);}}
 bind('app/api/auth/provider/route.ts');bind('app/api/auth/member/route.ts');
 const pw='/Users/christaylor/.npm/_npx/420ff84f11983ee5/node_modules/',executablePath='/Users/christaylor/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
 for(const n of [process.execPath,executablePath,...['playwright/package.json','playwright/index.js','playwright-core/package.json','playwright-core/index.js','playwright-core/browsers.json','playwright-core/lib/bootstrap.js','playwright-core/lib/coreBundle.js','playwright-core/lib/utilsBundle.js'].map(n=>pw+n)])result.runtimeHashes[n]=sha(read(n));
 for(const n of ['node_modules/typescript/package.json','node_modules/typescript/lib/typescript.js','node_modules/@supabase/ssr/package.json','node_modules/@supabase/supabase-js/package.json','node_modules/ethers/package.json','node_modules/siwe/package.json'])result.runtimeHashes[path.join(ROOT,n)]=sha(read(n));
 for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes}))assert.equal(sha(read(n)),h);
 process.chdir(path.join(ROOT,'verification/web'));const{offlineApp}=await import('./support/offline-app.mjs');const app=offlineApp();
 const user=()=>({id:SUBJECT,aud:'authenticated',role:'authenticated',email:EMAIL,identities:[{id:SUBJECT}],user_metadata:{},app_metadata:{provider:'email'},created_at:'2026-01-01T00:00:00Z'});
 app.setMock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:cookieUser?user():null},error:cookieUser?null:{name:'AuthSessionMissingError'}})}})}));
 const providerRoute=app.load('app/api/auth/provider/route.ts'),memberRoute=app.load('app/api/auth/member/route.ts');
 const req=(url,method,headers,body)=>{const request=new Request(url,{method,headers,...(body?{body}:{})});const cookies=new Map((new Headers(headers).get('cookie')??'').split(';').map(x=>x.trim().split('=')));Object.defineProperties(request,{nextUrl:{value:new URL(url)},cookies:{value:{get:key=>cookies.has(key)?{value:cookies.get(key)}:undefined}}});return request;};
 browser=await createRequire(pw+'playwright/package.json')('playwright').chromium.launch({executablePath,headless:true,env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:'/Users/christaylor'},args:['--disable-background-networking','--disable-component-update','--no-first-run']});
 async function open(){if(context)await context.close();context=await browser.newContext({viewport:{width:320,height:850},serviceWorkers:'block',acceptDownloads:false});page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>result.errors.push(redact(e.stack||e)));page.on('console',m=>{if(secrets.some(s=>m.text().includes(s)))result.errors.push('Private browser console output');});
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());try{
   if(url.origin===ORIGIN&&url.pathname==='/login'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/page.css"><body><div id="root"></div><script type="module" src="/page.js"></script></body></html>'});return;}
   if(url.origin===ORIGIN&&['/page.js','/page.css'].includes(url.pathname)){await route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':'text/css',body:read(PREFIX+'-fixture'+url.pathname)});return;}
   const method=request.method(),body=request.postData()?JSON.parse(request.postData()):null,headers=await request.allHeaders();let response;
   if(url.origin===PROVIDER){assert.equal(headers.apikey,'sb_publishable_NONISSUED_WEB_LOGIN_BASELINE');
    if(url.pathname==='/auth/v1/token'){assert.equal(url.search,'?grant_type=password');assert.equal(body.email,EMAIL);assert.equal(body.password,PASSWORD);held=true;if(releaseToken)await new Promise(resolve=>{releaseToken=resolve;});response=new Response(JSON.stringify({access_token:TOKEN,refresh_token:REFRESH,token_type:'bearer',expires_in:3600,user:user()}));}
    else if(url.pathname==='/auth/v1/user'){assert.equal(headers.authorization,'Bearer '+TOKEN);response=new Response(JSON.stringify(user()));}
    else if(url.pathname==='/auth/v1/signup'){assert.equal(body.email,EMAIL);assert.equal(body.password,PASSWORD);assert.equal(body.code_challenge_method,'s256');response=new Response(JSON.stringify({user:user(),session:null}));}
    else throw Error('Unexpected provider endpoint');
   }else{
    assert.equal(url.origin,ORIGIN);const requestValue=req(url,method,headers,request.postData());cookieUser=null;
    if(url.pathname==='/api/auth/provider'){
     const encoded=(headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith('sb-web-login-provider-auth-token='))?.split('=').slice(1).join('=');assert(encoded,'Actual SDK session cookie absent');const value=decodeURIComponent(encoded);assert(value.startsWith('base64-'));const session=JSON.parse(Buffer.from(value.slice(7),'base64url'));assert.equal(session.access_token,TOKEN);assert.equal(session.user.id,SUBJECT);cookieUser=SUBJECT;response=await providerRoute.POST(requestValue);assert.equal(response.status,200);assert.equal(response.cookies.get('soe_auth_provider')?.value,'supabase');
    }else if(url.pathname==='/api/auth/member')response=await memberRoute.GET(requestValue);
    else throw Error('Unexpected member endpoint');
   }
   result.requests.push({method,path:url.pathname,status:response.status,bodyKeys:body?Object.keys(body).sort():[]});await route.fulfill({status:response.status,headers:{'content-type':'application/json','cache-control':'no-store'},body:await response.text()});
  }catch(e){result.errors.push(redact(e.stack||e));await route.abort().catch(()=>{});}});
  await page.goto(ORIGIN+'/login?recovery=1');await page.getByLabel('Email',{exact:true}).waitFor();await settle();
 }
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const fill=async()=>{await page.getByLabel('Email',{exact:true}).fill(EMAIL);await page.getByLabel('Password',{exact:true}).fill(PASSWORD);};
 await open();await fill();await page.getByRole('button',{name:'Create account',exact:true}).click();assert.equal(await page.getByLabel('Password',{exact:true}).inputValue(),PASSWORD);await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});await settle();assert.equal(await page.getByLabel('Email',{exact:true}).inputValue(),EMAIL);assert.equal(await page.getByLabel('Password',{exact:true}).inputValue(),PASSWORD);
 observe('Credential drafts remain visible after switching to signup, blur and offline; no sensitive-field retirement exists in this baseline.');
 await open();await fill();releaseToken=()=>{};held=false;await page.getByRole('button',{name:'SIGN IN',exact:true}).click();const deadline=Date.now()+7000;while(!held){assert(Date.now()<deadline,'Password request did not start');await new Promise(resolve=>setTimeout(resolve,10));}await page.evaluate(()=>window.loginQa.detach());await settle();const before=result.requests.filter(x=>x.path==='/api/auth/provider').length;releaseToken();releaseToken=null;await page.waitForFunction(()=>window.loginQa.navigations.some(x=>x.method==='push'));assert.equal(result.requests.filter(x=>x.path==='/api/auth/provider').length,before+1);assert.equal(await page.getByText('Login view closed').count(),1);
 observe('A password response arriving after actual Login unmount still runs canonical provider-selection POST and router.push through the retired submit continuation.');
 await open();await page.getByRole('button',{name:'Create account',exact:true}).click();await fill();const old=await page.locator('form').evaluate(node=>window.loginQa.retain(node));await page.getByRole('button',{name:'Sign in',exact:true}).click();const signupBefore=result.requests.filter(x=>x.path==='/auth/v1/signup').length;await page.evaluate(id=>window.loginQa.invoke(id),old);await page.getByRole('status').filter({hasText:'confirmation link'}).waitFor();assert.equal(result.requests.filter(x=>x.path==='/auth/v1/signup').length,signupBefore+1);assert.equal(await page.getByRole('heading',{name:'Welcome Back',exact:true}).count(),1);
 observe('A real signup form callback retained before mode change still sends the previous signup credentials while the current screen is signin.');
 assert.deepEqual(result.errors,[]);result.status='BASELINE_REPRODUCED';
}catch(e){result.status='FAIL';result.failure=redact(e.stack||e);process.exitCode=1;}
finally{releaseToken?.();if(page)await page.evaluate(()=>window.loginQa?.close()).catch(()=>{});if(browser){await browser.close();result.cleanup.browser='closed';}try{for(const[n,h]of Object.entries({...result.sourceHashes,...result.runtimeHashes,...result.servedHashes}))assert.equal(sha(read(n)),h,'Input changed');}catch(e){result.status='FAIL';result.failure??=redact(e.stack||e);process.exitCode=1;}result.completedAt=new Date().toISOString();write();}
if(result.status!=='BASELINE_REPRODUCED')throw Error(result.failure||'Baseline incomplete');console.log('Reproduced3 baseline defects; this is not acceptance.');
