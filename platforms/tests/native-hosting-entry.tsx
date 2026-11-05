import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../native/App';
import {MemberCircleScreen} from '../native/MemberCircleScreen';
import {createOwnedNativeAuth} from '../native/src/auth/owned-auth';
import {createNativeAuthPorts} from '../native/src/auth/native-auth-ports';
const root=createRoot(document.getElementById('root')!);
const origin='https://native-circle-directory.test',providerOrigin='https://native-auth-provider.test',publishableKey='sb_publishable_NONISSUED_NATIVE_OWNED_AUTH',storageKey='soe.native.owned.qa';
type Network='online'|'offline'|'unknown';
type Gate={path:string;method?:string;promise:Promise<void>;release():void};
type Disk={generation:string;slots:Map<string,string>;resetUnknown:boolean};
type CapturedCallback=(value?:string)=>unknown;
const latestCallbacks=new Map<string,CapturedCallback>(),retainedCallbacks=new Map<string,CapturedCallback>();
let savedEnabled=true,readingEnabled=true,attendanceEnabled=true,hostingEnabled=true;
let sequence=0,epoch=0,online:Network='online',disk:Disk={generation:uuid(),slots:new Map(),resetUnknown:false},held:Gate|null=null;
let prepared=0,reads=0,writes=0,resets=0,cancels=0,handles=0,connectionsClosed=0,preparationHeld=false;
let heldPreparation:Gate|null=null,heldDelivery:Gate|null=null;
let invalidMemberClosed=0;

const requests:Array<{kind:string;path:string;method:string;bodyKeys:string[];held:boolean;status?:number}>=[];
const netListeners=new Set<(state:Network)=>void>(),appListeners=new Map<string,Set<(state:string)=>void>>();
const appState={currentState:'active',addEventListener(name:string,fn:(state:string)=>void){let listeners=appListeners.get(name);if(!listeners){listeners=new Set();appListeners.set(name,listeners);}listeners.add(fn);return{remove(){listeners?.delete(fn);}};}};
const connectivity={snapshot:()=>online,subscribe(fn:(state:Network)=>void){netListeners.add(fn);return()=>{netListeners.delete(fn);};}};
function uuid(){return`98000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`;}
function createBridge(store:Disk){
 const allocated=new Map<string,string>();
 const assertGeneration=(generation:string)=>{if(generation!==store.generation)throw Error('Synthetic stale native epoch');};
 async function deliver(kind:string,id:string,request:{url:string;method:string;bearer?:string;body?:string}){
  const generation=allocated.get(id);if(!generation)throw Error('Synthetic native handle missing');assertGeneration(generation);allocated.delete(id);handles--;
  const url=new URL(request.url),entry={kind,path:url.pathname+url.search,method:request.method,bodyKeys:request.body?Object.keys(JSON.parse(request.body)).sort():[],held:false,status:undefined as number|undefined};requests.push(entry);
  const headers:Record<string,string>={};if(request.bearer)headers.Authorization='Bearer '+request.bearer;if(request.body!==undefined)headers['Content-Type']='application/json';if(kind==='provider')headers.apikey=publishableKey;
  const response=await fetch(request.url,{method:request.method,headers,body:request.body,credentials:'omit',cache:'no-store',redirect:'error'}),body=await response.text();entry.status=response.status;
  const gate=held&&held.path===url.pathname&&(!held.method||held.method===request.method)?held:null;if(gate){held=null;heldDelivery=gate;entry.held=true;await gate.promise;if(heldDelivery===gate)heldDelivery=null;}
  // Delivery can arrive after native cancellation. Real JS ports must reject it.
  return{status:response.status,url:request.url,body,redirected:false};
 }
 return{
  async capabilities(){return{version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:store.generation,requestIdPolicy:'os-random-uuid',publicPolicy:'circle-discovery-v1',...(hostingEnabled?{hostingPolicy:'circle-host-v1'}:{}),...(attendanceEnabled?{attendancePolicy:'circle-rsvp-v1'}:{}),...(savedEnabled?{savedReadingPolicy:'owner-reading-v1'}:{}),...(readingEnabled?{readingPolicy:'pinned-passage-v1'}:{}),authPolicy:'supabase-password-v1',providerOrigin,publishableKey};},
  async newRequestId(generation:string){assertGeneration(generation);return uuid();},
  async begin(generation:string){assertGeneration(generation);const id='native_qa_'+(++sequence);allocated.set(id,generation);handles++;return id;},
  async send(id:string,request:Parameters<typeof deliver>[2]){return deliver('member',id,request);},
  async sendPublic(id:string,request:Parameters<typeof deliver>[2]){return deliver('public',id,request);},
  async sendAuth(id:string,request:Parameters<typeof deliver>[2]){return deliver('provider',id,request);},
  async cancel(id:string){cancels++;if(allocated.delete(id))handles--;},
  async read(slot:string,generation:string){reads++;assertGeneration(generation);return store.slots.get(slot)??null;},
  async write(slot:string,value:string,generation:string){writes++;assertGeneration(generation);store.slots.set(slot,value);},
  async remove(slot:string,generation:string){assertGeneration(generation);store.slots.delete(slot);},
  async resetAccountStorage(generation:string){resets++;assertGeneration(generation);store.slots.clear();store.generation=uuid();if(store.resetUnknown)throw Error('Synthetic reset receipt lost after local clear');return{previousGeneration:generation,generation:store.generation,cleared:true};},
 };
}
const qa={appState,requests,platform:new URL(window.location.href).searchParams.get('platform')==='ios'?'ios':'android',
 capture(kind:string,label:string|undefined,callback:CapturedCallback){if(label&&typeof callback==='function')latestCallbacks.set(kind+':'+label,callback);},
 retainCallback(kind:string,label:string){const callback=latestCallbacks.get(kind+':'+label);if(!callback)throw Error('No real native callback for '+kind+':'+label);const id=uuid();retainedCallbacks.set(id,callback);return id;},
 invokeCallback(id:string,value?:string){const callback=retainedCallbacks.get(id);if(!callback)throw Error('Captured callback unavailable');return callback(value);},
 releaseCallbacks(){retainedCallbacks.clear();},
 showInvalidMember(){root.render(<MemberCircleScreen config={null as never} connectivity={connectivity} onClose={()=>{invalidMemberClosed++;root.render(<div>Invalid member configuration closed</div>);}}/>);},
 hostingAvailable(value:boolean){hostingEnabled=value;},
 attendanceAvailable(value:boolean){attendanceEnabled=value;},
 savedReadingAvailable(value:boolean){savedEnabled=value;},readingAvailable(value:boolean){readingEnabled=value;},
 showUnconfigured(){root.render(<React.StrictMode key={++epoch}><App/></React.StrictMode>);},
 show(network:Network='online',preserve=false){
  held?.release();held=null;heldDelivery?.release();heldDelivery=null;heldPreparation?.release();heldPreparation=null;preparationHeld=false;online=network;appState.currentState='active';requests.length=0;prepared=0;reads=0;writes=0;resets=0;cancels=0;connectionsClosed=0;
  if(!preserve)disk={generation:uuid(),slots:new Map(),resetUnknown:false};
  const bridge=createBridge(disk);
  const prepare=async()=>{prepared++;const ports=await createNativeAuthPorts(bridge,{origin,storageKey,providerOrigin,publishableKey,timeoutMs:2000});
   const controller=createOwnedNativeAuth({ports,publishableKey,timeoutMs:2000});
   let closed=false;const connection={controller,config:{origin,auth:controller.auth,transport:ports.member.transport,savedReadingTransport:ports.member.savedReadingTransport,attendanceTransport:ports.member.attendanceTransport,hostingTransport:ports.member.hostingTransport,editionTransport:ports.member.editionTransport,publicTransport:ports.member.publicTransport,passageTransport:ports.member.passageTransport,timeoutMs:1200,newRequestId:ports.member.newRequestId},connectivity,close(){if(!closed){closed=true;connectionsClosed++;controller.close();ports.retire();}}};
   const gate=heldPreparation;if(gate){preparationHeld=true;await gate.promise;}return connection;
  };
  root.render(<React.StrictMode key={++epoch}><App ownedAccountPrepare={prepare}/></React.StrictMode>);
 },
 stats:()=>({prepared,reads,writes,resets,cancels,handles,connectionsClosed,preparationHeld,invalidMemberClosed,retainedCallbacks:retainedCallbacks.size,storedSlots:[...disk.slots.keys()].sort(),netListeners:netListeners.size,appListeners:[...appListeners.values()].reduce((n,set)=>n+set.size,0)}),
 activity(name:string,value='active'){if(name==='change')appState.currentState=value;for(const fn of [...appListeners.get(name)??[]])fn(value);},
 network(value:Network){online=value;for(const fn of [...netListeners])fn(value);},
 hold(path:string,method?:string){let release=()=>{};const promise=new Promise<void>(resolve=>{release=resolve;});held={path,method,promise,release};},
 release(){held?.release();held=null;heldDelivery?.release();heldDelivery=null;},
 holdPreparation(){let release=()=>{};const promise=new Promise<void>(resolve=>{release=resolve;});heldPreparation={path:'preparation',promise,release};},
 releasePreparation(){heldPreparation?.release();heldPreparation=null;preparationHeld=false;},
 resetUnknown(){disk.resetUnknown=true;},
 expireSaved(){const value=disk.slots.get('session');if(!value)throw Error('No synthetic saved session');const saved=JSON.parse(value);saved.expires_at=Math.floor(Date.now()/1000)-10;disk.slots.set('session',JSON.stringify(saved));},
 unmount(){latestCallbacks.clear();retainedCallbacks.clear();root.render(<div>Owned authentication fixture unmounted</div>);},
};
Object.assign(window,{nativeQa:qa});qa.show();
