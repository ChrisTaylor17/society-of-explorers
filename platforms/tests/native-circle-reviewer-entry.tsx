import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../native/App';
import {createOwnedNativeAuth} from '../native/src/auth/owned-auth';
import {createNativeAuthPorts} from '../native/src/auth/native-auth-ports';
const root=createRoot(document.getElementById('root')!);
const origin='https://native-circle-directory.test',providerOrigin='https://native-auth-provider.test',publishableKey='sb_publishable_NONISSUED_NATIVE_OWNED_AUTH';
const storageKey='soe.native.circle.reviewer.qa';
type Network='online'|'offline'|'unknown';
type Wire={url:string;method:string;body?:string;bearer?:string};
let network:Network='online',epoch=0,sequence=0,prepared=0,reads=0,writes=0,handles=0,closedConnections=0;
const netListeners=new Set<(value:Network)=>void>(),appListeners=new Map<string,Set<(value:string)=>void>>();
const callbacks=new Map<number,(value:unknown)=>void>(),scopes=new Set<()=>void>();
const requests:Array<{kind:string;path:string;method:string;bodyKeys:string[];status?:number}>=[];
const appState={currentState:'active',addEventListener(name:string,fn:(value:string)=>void){let set=appListeners.get(name);if(!set){set=new Set();appListeners.set(name,set);}set.add(fn);return{remove(){set?.delete(fn);}};}};
const connectivity={snapshot:()=>network,subscribe(fn:(value:Network)=>void){netListeners.add(fn);return()=>{netListeners.delete(fn);};}};
function createBridge(capability:boolean){
 let generation=crypto.randomUUID();const slots=new Map<string,string>(),allocated=new Map<string,string>();
 const check=(value:string)=>{if(value!==generation)throw Error('Synthetic retired native generation');};
 const retire=()=>{handles-=allocated.size;allocated.clear();};scopes.add(retire);
 function consume(id:string){const g=allocated.get(id);if(!g)throw Error('Synthetic missing native handle');check(g);allocated.delete(id);handles--;}
 async function deliver(kind:string,request:Wire){
  const url=new URL(request.url),entry={kind,path:url.pathname,method:request.method,bodyKeys:request.body?Object.keys(JSON.parse(request.body)).sort():[],status:undefined as number|undefined};requests.push(entry);
  const headers:Record<string,string>={};if(request.bearer)headers.Authorization='Bearer '+request.bearer;
  if(kind==='provider'){headers.apikey=publishableKey;if(!headers.Authorization)headers.Authorization='Bearer '+publishableKey;}
  if(request.body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(request.url,{method:request.method,body:request.body,headers,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'}),body=await response.text();entry.status=response.status;
  return{url:request.url,status:response.status,body,redirected:false};
 }
 return{
  async capabilities(){return{version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:generation,requestIdPolicy:'os-random-uuid',authPolicy:'supabase-password-v1',providerOrigin,publishableKey,messageReviewPolicy:'assigned-message-review-v1',...(capability?{circleReviewPolicy:'assigned-circle-review-v1'}:{})};},
  async begin(g:string){check(g);const id='reviewer_qa_'+(++sequence);allocated.set(id,g);handles++;return id;},
  async cancel(id:string){if(allocated.delete(id))handles--;},
  async newRequestId(g:string){check(g);return crypto.randomUUID();},
  async send(id:string,request:Wire){consume(id);return deliver('member',request);},
  async sendAuth(id:string,request:Wire){consume(id);return deliver('provider',request);},
  async sendReview(id:string,request:Wire){consume(id);return deliver('message-reviewer',request);},
  async sendCircleReview(id:string,request:Wire){consume(id);return deliver('reviewer',request);},
  async read(slot:string,g:string){check(g);reads++;return slots.get(slot)??null;},
  async write(slot:string,value:string,g:string){check(g);writes++;slots.set(slot,value);},
  async remove(slot:string,g:string){check(g);slots.delete(slot);},
  async resetAccountStorage(g:string){check(g);const previousGeneration=generation;generation=crypto.randomUUID();slots.clear();retire();return{previousGeneration,generation,cleared:true};},
 };
}
const qa={appState,requests,
 show({legacy=false}:{legacy?:boolean}={}){
  for(const retire of scopes)retire();scopes.clear();network='online';appState.currentState='active';requests.length=0;prepared=reads=writes=closedConnections=0;
  const bridge=createBridge(!legacy);
  const prepare=async()=>{prepared++;const ports=await createNativeAuthPorts(bridge,{origin,storageKey,providerOrigin,publishableKey,timeoutMs:1200});
   const controller=createOwnedNativeAuth({ports,publishableKey,timeoutMs:1200});let closed=false;
   return{controller,config:{...ports.member,auth:controller.auth},connectivity,close(){if(!closed){closed=true;closedConnections++;controller.close();ports.retire();}}};};
  root.render(<React.StrictMode key={++epoch}><App ownedAccountPrepare={prepare}/></React.StrictMode>);
 },
 stats:()=>({prepared,reads,writes,handles,closedConnections,netListeners:netListeners.size,appListeners:[...appListeners.values()].reduce((n,set)=>n+set.size,0)}),
 activity(name:string,value='active'){if(name==='change')appState.currentState=value;for(const fn of [...appListeners.get(name)??[]])fn(value);},
 network(value:Network){network=value;for(const fn of [...netListeners])fn(value);},
 retain(node:HTMLElement,name='onClick'){const key=Object.getOwnPropertyNames(node).find(name=>name.startsWith('__reactProps$'));const callback=key?(node as unknown as Record<string,Record<string,unknown>>)[key]?.[name]:null;if(typeof callback!=='function')throw Error('Actual React callback unavailable');const id=++sequence;callbacks.set(id,callback as(value:unknown)=>void);return id;},
 invoke(id:number){callbacks.get(id)?.({preventDefault(){}});},
 unmount(){root.render(<div>Native reviewer view unmounted</div>);},
};
Object.assign(window,{nativeCircleReviewerQa:qa});qa.show();
