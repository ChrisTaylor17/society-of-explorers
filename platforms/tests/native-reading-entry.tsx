import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../native/App';
import {createOwnedNativeAuth} from '../native/src/auth/owned-auth';
import {CircleDirectoryScreen} from '../native/CircleDirectoryScreen';
import {createVerifiedSupabaseCircleOwner} from '../native/src/circles/verified-member-session';
import {createNativeAuthPorts} from '../native/src/auth/native-auth-ports';
const root=createRoot(document.getElementById('root')!);
const origin='https://native-circle-directory.test',providerOrigin='https://native-auth-provider.test',publishableKey='sb_publishable_NONISSUED_NATIVE_OWNED_AUTH',storageKey='soe.native.owned.qa';
type Network='online'|'offline'|'unknown';
type Gate={path:string;promise:Promise<void>;release():void};
type Disk={generation:string;slots:Map<string,string>;resetUnknown:boolean};
let readingEnabled=true;
let sequence=0,epoch=0,online:Network='online',disk:Disk={generation:uuid(),slots:new Map(),resetUnknown:false},held:Gate|null=null;
let prepared=0,reads=0,writes=0,resets=0,cancels=0,handles=0,connectionsClosed=0,preparationHeld=false;
let heldPreparation:Gate|null=null,heldDelivery:Gate|null=null;
let standaloneClose:(()=>void)|null=null,heldDirectory:Gate|null=null,pendingDirectory:Gate|null=null;
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
  const gate=held&&held.path===url.pathname?held:null;if(gate){held=null;heldDelivery=gate;entry.held=true;await gate.promise;if(heldDelivery===gate)heldDelivery=null;}
  // Delivery can arrive after native cancellation. Real JS ports must reject it.
  return{status:response.status,url:request.url,body,redirected:false};
 }
 return{
  async capabilities(){return{version:2,origin,storageKey,redirectPolicy:'reject-before-send',storagePolicy:'os-protected',storageGeneration:store.generation,requestIdPolicy:'os-random-uuid',publicPolicy:'circle-discovery-v1',...(readingEnabled?{readingPolicy:'pinned-passage-v1'}:{}),authPolicy:'supabase-password-v1',providerOrigin,publishableKey};},
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
const qa={appState,requests,
 readingAvailable(value:boolean){readingEnabled=value;},
 showUnconfigured(){root.render(<React.StrictMode key={++epoch}><App/></React.StrictMode>);},
 show(network:Network='online',preserve=false){
  standaloneClose?.();standaloneClose=null;held?.release();held=null;heldDelivery?.release();heldDelivery=null;heldPreparation?.release();heldPreparation=null;preparationHeld=false;online=network;appState.currentState='active';requests.length=0;prepared=0;reads=0;writes=0;resets=0;cancels=0;connectionsClosed=0;
  if(!preserve)disk={generation:uuid(),slots:new Map(),resetUnknown:false};
  const bridge=createBridge(disk);
  const prepare=async()=>{prepared++;const ports=await createNativeAuthPorts(bridge,{origin,storageKey,providerOrigin,publishableKey,timeoutMs:2000});
   const controller=createOwnedNativeAuth({ports,publishableKey,timeoutMs:2000});
   let closed=false;const connection={controller,config:{origin,auth:controller.auth,transport:ports.member.transport,publicTransport:ports.member.publicTransport,passageTransport:ports.member.passageTransport,newRequestId:ports.member.newRequestId},connectivity,close(){if(!closed){closed=true;connectionsClosed++;controller.close();ports.retire();}}};
   const gate=heldPreparation;if(gate){preparationHeld=true;await gate.promise;}return connection;
  };
  root.render(<React.StrictMode key={++epoch}><App ownedAccountPrepare={prepare}/></React.StrictMode>);
 },
 stats:()=>({prepared,reads,writes,resets,cancels,handles,connectionsClosed,preparationHeld,directoryResultHeld:Boolean(pendingDirectory),storedSlots:[...disk.slots.keys()].sort(),netListeners:netListeners.size,appListeners:[...appListeners.values()].reduce((n,set)=>n+set.size,0)}),
 activity(name:string,value='active'){if(name==='change')appState.currentState=value;for(const fn of [...appListeners.get(name)??[]])fn(value);},
 network(value:Network){online=value;for(const fn of [...netListeners])fn(value);},
 hold(path:string){let release=()=>{};const promise=new Promise<void>(resolve=>{release=resolve;});held={path,promise,release};},
 release(){held?.release();held=null;heldDelivery?.release();heldDelivery=null;},
 holdPreparation(){let release=()=>{};const promise=new Promise<void>(resolve=>{release=resolve;});heldPreparation={path:'preparation',promise,release};},
 releasePreparation(){heldPreparation?.release();heldPreparation=null;preparationHeld=false;},
 resetUnknown(){disk.resetUnknown=true;},
 expireSaved(){const value=disk.slots.get('session');if(!value)throw Error('No synthetic saved session');const saved=JSON.parse(value);saved.expires_at=Math.floor(Date.now()/1000)-10;disk.slots.set('session',JSON.stringify(saved));},
 holdDirectoryResult(path:string){let release=()=>{};const promise=new Promise<void>(resolve=>{release=resolve;});heldDirectory={path,promise,release};},
 releaseDirectoryResult(){heldDirectory?.release();heldDirectory=null;pendingDirectory?.release();pendingDirectory=null;},
 async standaloneDirectory(){
  // Isolate Directory's own lifecycle fence using actual restored AuthClient,
  // verified owner and native JS ports, without the App parent's unmount fence.
  qa.unmount();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  online='online';appState.currentState='active';const ports=await createNativeAuthPorts(createBridge(disk),{origin,storageKey,providerOrigin,publishableKey,timeoutMs:2000});
  const controller=createOwnedNativeAuth({ports,publishableKey,timeoutMs:2000});controller.activity(true);controller.connectivity(true);await controller.resume();if(!controller.model().ready)throw Error('Standalone actual authentication restore failed');
  const binding=createVerifiedSupabaseCircleOwner(controller.auth);binding.activity(true);await binding.start();if(binding.model().phase!=='ready')throw Error('Standalone verified owner unavailable');
  let closed=false;standaloneClose=()=>{if(closed)return;closed=true;binding.stop();controller.close();ports.retire();connectionsClosed++;};
  const transport:typeof ports.member.transport=async(url,init)=>{
   const response=await ports.member.transport(url,init),gate=heldDirectory?.path===new URL(url).pathname?heldDirectory:null;
   // Native ports and canonical HTTP/SQL have completed. This explicit delivery
   // fault delays only the caller's result and deliberately ignores later abort,
   // isolating the UI's own stale-continuation fence from native cancellation.
   if(gate){heldDirectory=null;pendingDirectory=gate;await gate.promise;if(pendingDirectory===gate)pendingDirectory=null;}return response;
  };
  root.render(<CircleDirectoryScreen config={{...ports.member,transport,owner:binding.owner}} connectivity={connectivity} onBack={()=>qa.unmount()} onClose={()=>qa.unmount()}/>);
 },
 unmount(){qa.releaseDirectoryResult();standaloneClose?.();standaloneClose=null;root.render(<div>Owned authentication fixture unmounted</div>);},
};
Object.assign(window,{nativeQa:qa});qa.show();
