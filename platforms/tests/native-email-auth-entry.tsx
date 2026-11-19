import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../native/App';
import {createOwnedNativeAuth} from '../native/src/auth/owned-auth';
import {createNativeEmailAuth} from '../native/src/auth/email-auth';
import {createNativeAuthPorts} from '../native/src/auth/native-auth-ports';
import type {NativeEmailPending,NativeEmailPurpose} from '../native/src/auth/email-auth-types';
const root=createRoot(document.getElementById('root')!);
const origin='https://native-circle-directory.test',providerOrigin='https://native-auth-provider.test',publishableKey='sb_publishable_NONISSUED_NATIVE_OWNED_AUTH';
const storageKey='soe.native.email.qa',callbackUrl='org.soe.synthetic.email://auth/callback';
type Network='online'|'offline'|'unknown';
declare const __NATIVE_EMAIL_CODE_TTL__:number;
const codeTtl=__NATIVE_EMAIL_CODE_TTL__;
type Pending=NativeEmailPending&{verifier:string;code?:string;receivedAt?:number;started:boolean};
type Scope={flowId:string;purpose:NativeEmailPurpose;email:string;verifier:string;code:string;expiresAt:number;used:Set<string>;token?:string;subject?:string;verified:boolean};
type Disk={generation:string;slots:Map<string,string>;pending:Pending|null};
type Gate={kind:string;promise:Promise<void>;release():void;entered:boolean};
type Wire={url:string;method:string;body?:string;bearer?:string;flowId?:string};
let disk:Disk={generation:crypto.randomUUID(),slots:new Map(),pending:null},network:Network='online',epoch=0,sequence=0;
let prepared=0,reads=0,writes=0,claims=0,prepares=0,loads=0,discards=0,cancels=0,closedConnections=0,handles=0;
let gate:Gate|null=null,oldFlow:string|null=null,tamperClaim:string|null=null;
const scopes=new Set<{retire():void}>(),netListeners=new Set<(value:Network)=>void>(),appListeners=new Map<string,Set<(value:string)=>void>>();
const callbacks=new Map<number,(value:unknown)=>void>();
const requests:Array<{kind:string;path:string;method:string;bodyKeys:string[];status?:number}>=[];
const appState={currentState:'active',addEventListener(name:string,fn:(value:string)=>void){let set=appListeners.get(name);if(!set){set=new Set();appListeners.set(name,set);}set.add(fn);return{remove(){set?.delete(fn);}};}};
const connectivity={snapshot:()=>network,subscribe(fn:(value:Network)=>void){netListeners.add(fn);return()=>{netListeners.delete(fn);};}};
const fail=()=>Error('Synthetic native policy refusal');
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function pause(kind:string){const held=gate;if(held?.kind===kind){held.entered=true;await held.promise;}}
function createBridge(store:Disk,emailCap:boolean){
 const allocated=new Map<string,string>();let scope:Scope|null=null,lifetime=0;
 const check=(generation:string)=>{if(generation!==store.generation)throw fail();};
 const retirement={retire(){lifetime++;scope=null;handles-=allocated.size;allocated.clear();}};scopes.add(retirement);
 const publicPending=(p:Pending):NativeEmailPending=>({flowId:p.flowId,purpose:p.purpose,email:p.email,challenge:p.challenge,redirectTo:p.redirectTo,createdAt:p.createdAt,expiresAt:p.expiresAt,phase:p.phase});
 function consume(id:string){const generation=allocated.get(id);if(!generation)throw fail();check(generation);allocated.delete(id);handles--;}
 async function deliver(kind:string,request:Wire){
  const url=new URL(request.url),entry={kind,path:url.pathname+(url.pathname==='/auth/v1/token'?url.search:''),method:request.method,bodyKeys:request.body?Object.keys(JSON.parse(request.body)).sort():[],status:undefined as number|undefined};requests.push(entry);
  const headers:Record<string,string>={};if(request.bearer)headers.Authorization='Bearer '+request.bearer;
  if(kind!=='member'){headers.apikey=publishableKey;if(!headers.Authorization)headers.Authorization='Bearer '+publishableKey;}
  if(request.body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(request.url,{method:request.method,body:request.body,headers,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'}),body=await response.text();entry.status=response.status;
  await pause(request.method+' '+url.pathname);
  return{url:request.url,status:response.status,body,redirected:false};
 }
 return{
  async capabilities(){return{version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:store.generation,requestIdPolicy:'os-random-uuid',authPolicy:'supabase-password-v1',providerOrigin,publishableKey,...(emailCap?{emailAuthPolicy:'supabase-email-pkce-v1',emailCallbackUrl:callbackUrl}:{})};},
  async begin(generation:string){check(generation);const id='email_qa_'+(++sequence);allocated.set(id,generation);handles++;return id;},
  async cancel(id:string){cancels++;if(allocated.delete(id))handles--;},
  async newRequestId(generation:string){check(generation);return crypto.randomUUID();},
  async send(id:string,request:Wire){consume(id);return deliver('member',request);},
  async sendAuth(id:string,request:Wire){consume(id);return deliver('ordinary',request);},
  async read(slot:string,generation:string){check(generation);reads++;return store.slots.get(slot)??null;},
  async write(slot:string,value:string,generation:string){check(generation);writes++;store.slots.set(slot,value);},
  async remove(slot:string,generation:string){check(generation);store.slots.delete(slot);},
  async resetAccountStorage(generation:string){check(generation);const previousGeneration=store.generation;store.generation=crypto.randomUUID();store.slots.clear();store.pending=null;retirement.retire();return{previousGeneration,generation:store.generation,cleared:true};},
  async prepareEmailLink(generation:string,purpose:NativeEmailPurpose,email:string){
   check(generation);retirement.retire();const captured=lifetime;prepares++;const verifier=b64(crypto.getRandomValues(new Uint8Array(32))),challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));check(generation);if(captured!==lifetime)throw fail();
   const flowId=crypto.randomUUID(),createdAt=Date.now();store.pending={flowId,purpose,email,challenge,verifier,redirectTo:callbackUrl+'?flow='+flowId,createdAt,expiresAt:createdAt+3600000,phase:'waiting',started:false};return publicPending(store.pending);
  },
  async pendingEmailLink(generation:string){check(generation);loads++;if(store.pending&&(store.pending.expiresAt<=Date.now()||(store.pending.receivedAt??Infinity)+codeTtl<=Date.now()))store.pending=null;return store.pending?publicPending(store.pending):null;},
  async claimEmailLink(generation:string,flowId:string){
   check(generation);claims++;const pending=store.pending;if(!pending||pending.flowId!==flowId||pending.expiresAt<=Date.now()||pending.phase!=='callback_ready'||!pending.code||!pending.receivedAt||pending.receivedAt+codeTtl<=Date.now())throw fail();store.pending=null;
   const claimExpiresAt=Math.min(pending.expiresAt,pending.receivedAt+codeTtl);
   scope={flowId:pending.flowId,purpose:pending.purpose,email:pending.email,code:pending.code,verifier:pending.verifier,expiresAt:claimExpiresAt,used:new Set(),verified:false};
   const result={flowId:pending.flowId,purpose:pending.purpose,email:pending.email,code:pending.code,verifier:pending.verifier,expiresAt:claimExpiresAt};
   await pause('claim');
   const tamper=tamperClaim;tamperClaim=null;
   return tamper==='flow'?{...result,flowId:crypto.randomUUID()}:tamper==='purpose'?{...result,purpose:result.purpose==='signup'?'recovery':'signup'}:tamper==='expired'?{...result,expiresAt:Date.now()-1}:result;
  },
  async discardEmailLink(generation:string,flowId:string){check(generation);discards++;const matches=store.pending?.flowId===flowId;if(matches)store.pending=null;if(matches||scope?.flowId===flowId)retirement.retire();},
  async sendEmailAuth(id:string,request:Wire&{flowId:string}){
   consume(id);const captured=lifetime;const url=new URL(request.url),body=request.body?JSON.parse(request.body):null;
   if(url.origin!==providerOrigin)throw fail();
   const action=request.method==='POST'&&['/auth/v1/signup','/auth/v1/resend','/auth/v1/recover'].includes(url.pathname)?url.pathname.slice(9)
    :request.method==='POST'&&url.pathname+url.search==='/auth/v1/token?grant_type=pkce'?'exchange':url.pathname==='/auth/v1/user'&&request.method==='GET'?'user':url.pathname==='/auth/v1/user'&&request.method==='PUT'?'update':null;
   if(!action)throw fail();
   let current:Scope|null=null;
   if(['signup','resend','recover'].includes(action)){
    const p=store.pending;if(!p||p.flowId!==request.flowId||p.expiresAt<=Date.now()||p.started||p.phase!=='waiting'||p.purpose!==(action==='recover'?'recovery':'signup'))throw fail();
    if(body.email!==p.email||body.code_challenge!==p.challenge||body.code_challenge_method!=='s256'||url.searchParams.get('redirect_to')!==p.redirectTo||request.bearer)throw fail();p.started=true;
   }else{
    current=scope;if(!current||current.flowId!==request.flowId||current.expiresAt<=Date.now()||current.used.has(action))throw fail();
    if(action==='exchange'){if(body.auth_code!==current.code||body.code_verifier!==current.verifier||request.bearer)throw fail();}
    else if(request.bearer!==current.token||!current.token||action==='update'&&(current.purpose!=='recovery'||!current.verified))throw fail();
    current.used.add(action);
   }
   const response=await deliver('email',request);
   if(captured!==lifetime||current&&(scope!==current||current.expiresAt<=Date.now())||!current&&store.pending?.flowId!==request.flowId)throw fail();
   if(current&&response.status!==200){scope=null;return response;}
   if(current&&scope===current&&response.status===200){const parsed=JSON.parse(response.body);if(action==='exchange'){current.token=parsed.access_token;current.subject=parsed.user?.id;}
    if(action==='user'){const user=parsed.user??parsed;if(user.id!==current.subject)throw fail();current.verified=true;}if(action==='update')scope=null;}
   return response;
  },
 };
}
const qa={appState,requests,
 show({preserve=false,legacy=false,online='online'}:{preserve?:boolean;legacy?:boolean;online?:Network}={}){
  for(const scope of scopes)scope.retire();scopes.clear();
  gate?.release();gate=null;network=online;appState.currentState='active';requests.length=0;prepared=0;reads=0;writes=0;claims=0;prepares=0;loads=0;discards=0;cancels=0;closedConnections=0;oldFlow=null;tamperClaim=null;
  if(!preserve)disk={generation:crypto.randomUUID(),slots:new Map(),pending:null};
  const bridge=createBridge(disk,!legacy);
  const prepare=async()=>{prepared++;const ports=await createNativeAuthPorts(bridge,{origin,storageKey,providerOrigin,publishableKey,timeoutMs:800});
   const controller=createOwnedNativeAuth({ports,publishableKey,timeoutMs:800}),email=ports.email?createNativeEmailAuth({ports:ports.email,publishableKey,timeoutMs:800}):undefined;
   let closed=false;const connection={controller,email,config:{...ports.member,auth:controller.auth},connectivity,close(){if(!closed){closed=true;closedConnections++;email?.close();controller.close();ports.retire();}}};await pause('preparation');return connection;
  };
  root.render(<React.StrictMode key={++epoch}><App ownedAccountPrepare={prepare}/></React.StrictMode>);
 },
 stats:()=>({prepared,reads,writes,claims,prepares,loads,discards,cancels,closedConnections,handles,storedSlots:[...disk.slots.keys()].sort(),pending:disk.pending?{purpose:disk.pending.purpose,phase:disk.pending.phase,hasCode:Boolean(disk.pending.code)}:null,held:gate?.entered??false,netListeners:netListeners.size,appListeners:[...appListeners.values()].reduce((n,set)=>n+set.size,0)}),
 callback({code,wrong=false,old=false,error=false}:{code:string;wrong?:boolean;old?:boolean;error?:boolean}){
  const p=disk.pending;if(!p)return false;
  const flow=wrong?crypto.randomUUID():old?oldFlow:p.flowId;
  const url=new URL(callbackUrl+'?flow='+flow+(error?'&error=access_denied':'&code='+encodeURIComponent(code)));
  if(url.pathname!=='/callback'||url.searchParams.get('flow')!==p.flowId||p.phase!=='waiting'||!p.started||p.expiresAt<=Date.now())return false;
  if(error)p.phase='callback_error';else{p.code=code;p.receivedAt=Date.now();p.phase='callback_ready';}return true;
 },
 expireCode(){if(disk.pending?.receivedAt)disk.pending.receivedAt=Date.now()-codeTtl-1;},
 rememberFlow(){oldFlow=disk.pending?.flowId??null;},expirePending(){if(disk.pending)disk.pending.expiresAt=Date.now()-1;},
 tamperClaim(value:string){tamperClaim=value;},
 activity(name:string,value='active'){if(name==='change')appState.currentState=value;if(name==='blur'||name==='change'&&value!=='active')for(const s of scopes)s.retire();for(const fn of [...appListeners.get(name)??[]])fn(value);},
 network(value:Network){network=value;for(const fn of [...netListeners])fn(value);},
 hold(kind:string){let release=()=>{};const promise=new Promise<void>(resolve=>{release=resolve;});gate={kind,promise,release,entered:false};},release(){gate?.release();gate=null;},
 retain(node:HTMLElement,name:'onClick'|'onChange'){
  const key=Object.getOwnPropertyNames(node).find(name=>name.startsWith('__reactProps$'));const callback=key?(node as unknown as Record<string,Record<string,unknown>>)[key]?.[name]:null;
  if(typeof callback!=='function')throw Error('Actual React callback unavailable');const id=++sequence;callbacks.set(id,callback as(value:unknown)=>void);return id;
 },
 invoke(id:number,value=''){callbacks.get(id)?.({preventDefault(){},target:{value}});},
 unmount(){root.render(<div>Native email account view unmounted</div>);},
};
Object.assign(window,{nativeEmailQa:qa});qa.show();
