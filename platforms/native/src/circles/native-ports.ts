import { approvedOrigin, type CircleTransport } from './host';
import { parseDiscussionQuery } from '../../../../lib/circles/thread';
import { isUuid } from '../../../../lib/ids/uuid';

/** The native implementation owns the durable storage generation. Every storage
 * operation and allocated request is fenced by that generation across JS restarts. */
export type NativeMemberBridge = {
  capabilities(): Promise<{ version: number; origin: string; storageKey: string; redirectPolicy: string; storagePolicy: string; storageGeneration: string; requestIdPolicy?: string }>;
  newRequestId?(generation: string): Promise<string>;
  begin(generation: string): Promise<string>;
  send(id: string, request: { url: string; method: 'GET' | 'POST'; bearer: string; body?: string }): Promise<{ status: number; url: string; body: string; redirected: boolean }>;
  cancel(id: string): Promise<void>;
  read(slot: 'session' | 'pkce' | 'user', generation: string): Promise<string | null>;
  write(slot: 'session' | 'pkce' | 'user', value: string, generation: string): Promise<void>;
  remove(slot: 'session' | 'pkce' | 'user', generation: string): Promise<void>;
  resetAccountStorage(generation: string): Promise<{ previousGeneration: string; generation: string; cleared: boolean }>;
};
const fail = () => Error('Native member service unavailable');
const size = (s: string) => { let n=0; for (let i=0;i<s.length;i++) { const c=s.charCodeAt(i); if(c<128)n++;else if(c<2048)n+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<s.length&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){n+=4;i++;}else n+=3; } return n; };
// Trusted composition may wrap the same native account more than once. Retire
// every wrapper in this JS runtime together, including already-computed replies.
// The native persisted epoch separately fences future work and process restarts.
const lanes = new Map<string, { tail: Promise<void>; generation: number; capabilitySequence: number; nativeGeneration: string | null; quarantined: boolean; requests: Set<AbortController>; retirements: Set<() => void> }>();
function timed<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(fail()),ms);})]).finally(()=>clearTimeout(timer));
}
export async function createNativeMemberPorts(bridge: NativeMemberBridge | null, config: { origin: string; storageKey: string; timeoutMs?: number }) {
  const origin=approvedOrigin(config.origin), key=config.storageKey, timeout=config.timeoutMs??15000;
  if(!bridge || !/^[A-Za-z0-9._-]{1,160}$/.test(key) || !Number.isSafeInteger(timeout) || timeout<1 || timeout>60000) throw fail();
  if (!(['capabilities','begin','send','cancel','read','write','remove','resetAccountStorage'] as const).every(name => typeof bridge[name] === 'function')) throw fail();
  const namespace=JSON.stringify([origin,key]);let lane=lanes.get(namespace);if(!lane){lane={tail:Promise.resolve(),generation:0,capabilitySequence:0,nativeGeneration:null,quarantined:false,requests:new Set(),retirements:new Set()};lanes.set(namespace,lane);}
  const queue=lane, beforeGeneration=queue.generation, capabilitySequence=++queue.capabilitySequence;
  let caps: Awaited<ReturnType<NativeMemberBridge['capabilities']>>;
  try { caps=await timed(bridge.capabilities(),timeout); } catch { throw fail(); }
  if(caps?.version!==2 || caps.origin!==origin || caps.storageKey!==key || caps.redirectPolicy!=='reject-before-send' || caps.storagePolicy!=='os-protected' || !isUuid(caps.storageGeneration) || beforeGeneration!==queue.generation || capabilitySequence!==queue.capabilitySequence) throw fail();
  if(queue.nativeGeneration!==null && queue.nativeGeneration!==caps.storageGeneration){
    // A fresh native ready-generation is the authority after process recovery or
    // a lost reset reply. An old capability reply cannot undo a local retirement.
    queue.generation++;for(const request of queue.requests)request.abort();
    for(const listener of Array.from(queue.retirements)){try{listener();}catch{}}queue.retirements.clear();
    queue.tail=Promise.resolve();queue.quarantined=false;
  }
  if(queue.quarantined)throw fail();
  queue.nativeGeneration=caps.storageGeneration;
  const generation=queue.generation,nativeGeneration=caps.storageGeneration;let retired=false;
  const current=()=>!retired&&queue.generation===generation&&queue.nativeGeneration===nativeGeneration&&!queue.quarantined;
  const newRequestId = caps.requestIdPolicy === 'os-random-uuid' && typeof bridge.newRequestId === 'function' ? async () => {
    if (!current()) throw fail();
    const value = await timed(Promise.resolve().then(() => {
      if (!current()) throw fail();
      return bridge.newRequestId!(nativeGeneration);
    }), timeout);
    if (!current() || !isUuid(value)) throw fail();
    return value.toLowerCase();
  } : undefined;
  const slot=(value:string): 'session'|'pkce'|'user' => { if(value===key)return 'session';if(value===key+'-code-verifier')return 'pkce';if(value===key+'-user')return 'user';throw fail(); };
  const enqueue=<T>(work:()=>Promise<T>, keepAfterTimeout=false) => { if(!current())return Promise.reject(fail());let expired=false; const pending=queue.tail.then(()=>{if(!current()||(expired && !keepAfterTimeout))throw fail();return work();});queue.tail=pending.then(()=>{},()=>{});return timed(pending,timeout).catch(()=>{expired=true;throw fail();}); };
  const storage={
    getItem(name:string):Promise<string|null>{const s=slot(name);return enqueue(async()=>{const value=await bridge.read(s,nativeGeneration);if(!current()||value!==null&&(typeof value!=='string'||size(value)>65536))throw fail();return value;});},
    setItem(name:string,value:string):Promise<void>{const s=slot(name);if(typeof value!=='string'||size(value)>65536)throw fail();return enqueue(async()=>{await bridge.write(s,value,nativeGeneration);if(!current())throw fail();});},
    removeItem(name:string):Promise<void>{const s=slot(name);return enqueue(async()=>{await bridge.remove(s,nativeGeneration);if(!current())throw fail();});},
  };
  const transport:CircleTransport=async(url,init)=>{
    let id:string|undefined;
    let finished=false,cancelled=false;
    const cancel=()=>{if(!id||cancelled)return;cancelled=true;const requestId=id;void Promise.resolve().then(()=>bridge.cancel(requestId)).catch(()=>{});};
    const lifetime=new AbortController(), signal=lifetime.signal, abortLifetime=()=>lifetime.abort();
    if(init.signal.aborted)lifetime.abort();else init.signal.addEventListener('abort',abortLifetime,{once:true});
    queue.requests.add(lifetime);
    try {
      const u=new URL(url), headers=Object.entries(init.headers), allowed=headers.every(([name])=>['authorization','content-type'].includes(name.toLowerCase()));
      const auth=headers.filter(([name])=>name.toLowerCase()==='authorization');
      const ct=headers.filter(([name])=>name.toLowerCase()==='content-type');
      const match=auth.length===1&&/^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(auth[0][1]);
      const legacy = /^\/api\/book-salons\/([^/]+)$/.exec(u.pathname), discussion = /^\/api\/circles\/([^/]+)\/discussion$/.exec(u.pathname);
      const preview = /^\/api\/circles\/([^/]+)\/discussion\/preview$/.exec(u.pathname);
      const message = /^\/api\/circles\/([^/]+)\/messages\/([^/]+)$/.exec(u.pathname);
      const query = parseDiscussionQuery(u.searchParams);
      const hasQuery = u.href.includes('?');
      const account = !hasQuery && (u.pathname === '/api/auth/member' && init.method === 'GET'
        || u.pathname === '/api/auth/ensure-member' && init.method === 'POST');
      const approvedPath = account || (legacy ? isUuid(legacy[1]) && !hasQuery
        : discussion ? isUuid(discussion[1]) && (init.method === 'GET' ? query !== null && (!hasQuery || Boolean(u.search)) : init.method === 'POST' && !hasQuery)
        : preview ? isUuid(preview[1]) && init.method === 'POST' && !hasQuery
        : message && isUuid(message[1]) && isUuid(message[2]) && !hasQuery);
      if(!current()||u.href!==url||u.origin!==origin||u.username||u.password||u.href.includes('#')||!approvedPath||!allowed||!match||match[1].length>16384||init.redirect!=='error'||init.credentials!=='omit'||init.cache!=='no-store'||signal.aborted||!['GET','POST'].includes(init.method)||ct.length>1||(init.method==='GET'&&(init.body!==undefined||ct.length!==0))||(init.method==='POST'&&(ct.length!==1||ct[0][1]!=='application/json'||typeof init.body!=='string'||size(init.body)>16384))) throw fail();
      let rejectAbort: (reason: Error)=>void = () => {};
      const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
      const abort=()=>{cancel();rejectAbort(fail());};
      signal.addEventListener('abort',abort,{once:true});
      try {
        if(signal.aborted||!current())throw fail();
        // Keep observing begin after the caller's deadline/abort: the bridge may
        // allocate a native handle late, which still belongs to this attempt.
        const begun=Promise.resolve().then(()=>{
          if(finished||signal.aborted||!current())throw fail();
          return bridge.begin(nativeGeneration);
        }).then(value=>{
          if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw fail();
          id=value;
          if(finished||signal.aborted||!current()){cancel();throw fail();}
          return value;
        });
        const requestId=await timed(Promise.race([begun,aborted]),timeout);
        if(signal.aborted||!current())throw fail();
        const response=await timed(Promise.race([bridge.send(requestId,{url,method:init.method,bearer:match[1],...(init.body===undefined?{}:{body:init.body})}),aborted]),timeout);
        if(signal.aborted||!current()||!Number.isInteger(response.status)||response.status<100||response.status>599||response.status>=300&&response.status<400||response.redirected!==false||response.url!==url||typeof response.body!=='string'||size(response.body)>1048576)throw fail();
        return {status:response.status,url:response.url,redirected:false,json:async()=>{
          // A caller may retain the response after transport has completed.
          // Reading its private body still belongs to the original lifetime.
          if(!current()||signal.aborted||init.signal.aborted)throw fail();
          return JSON.parse(response.body);
        }};
      } finally {signal.removeEventListener('abort',abort);}
    } catch { cancel();throw fail(); }
    finally {finished=true;queue.requests.delete(lifetime);init.signal.removeEventListener('abort',abortLifetime);}
  };
  return { transport, storage, ...(newRequestId ? { newRequestId } : {}), retireStorage(){retired=true;},
    onAccountRetired(listener:()=>void) { if(!current()){listener();return ()=>{};}queue.retirements.add(listener);return ()=>{queue.retirements.delete(listener);}; },
    async resetAccountStorage() {
      if(!current())throw fail();
      const transition=++queue.generation;queue.quarantined=true;for(const request of queue.requests)request.abort();for(const listener of Array.from(queue.retirements)){try{listener();}catch{}}queue.retirements.clear();let expired=false;
      // Native serialization and epoch checks fence even a delayed old write.
      // Do not wait behind a JS reply that may never arrive before requesting the
      // durable native reset. A timeout keeps this lifetime quarantined.
      const pending=Promise.resolve().then(()=>bridge.resetAccountStorage(nativeGeneration)).then(receipt=>{
        if(receipt?.cleared!==true||receipt.previousGeneration!==nativeGeneration||!isUuid(receipt.generation)||receipt.generation===nativeGeneration||expired||queue.generation!==transition)throw fail();
        queue.nativeGeneration=receipt.generation;queue.quarantined=false;
      });
      queue.tail=pending.then(()=>{},()=>{});
      try { await timed(pending,timeout); } catch { expired=true;throw fail(); }
    },
  };
}
