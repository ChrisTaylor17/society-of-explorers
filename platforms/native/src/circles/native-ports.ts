import { approvedOrigin, type CircleTransport } from './host';
import { parseDiscussionQuery } from '../../../../lib/circles/thread';
import { isUuid } from '../../../../lib/ids/uuid';

/** Contract only: a platform bridge must implement serial secure storage and
 * reject redirects before forwarding credentials. No bridge is installed here. */
export type NativeMemberBridge = {
  capabilities(): Promise<{ version: number; origin: string; storageKey: string; redirectPolicy: string; storagePolicy: string }>;
  begin(): Promise<string>;
  send(id: string, request: { url: string; method: 'GET' | 'POST'; bearer: string; body?: string }): Promise<{ status: number; url: string; body: string; redirected: boolean }>;
  cancel(id: string): Promise<void>;
  read(slot: 'session' | 'pkce' | 'user'): Promise<string | null>;
  write(slot: 'session' | 'pkce' | 'user', value: string): Promise<void>;
  remove(slot: 'session' | 'pkce' | 'user'): Promise<void>;
};
const fail = () => Error('Native member service unavailable');
const size = (s: string) => { let n=0; for (let i=0;i<s.length;i++) { const c=s.charCodeAt(i); if(c<128)n++;else if(c<2048)n+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<s.length&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){n+=4;i++;}else n+=3; } return n; };
const lanes = new WeakMap<NativeMemberBridge, Map<string, { tail: Promise<void>; generation: number; quarantined: boolean; requests: Set<AbortController>; retirements: Set<() => void> }>>();
function timed<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(fail()),ms);})]).finally(()=>clearTimeout(timer));
}
export async function createNativeMemberPorts(bridge: NativeMemberBridge | null, config: { origin: string; storageKey: string; timeoutMs?: number }) {
  const origin=approvedOrigin(config.origin), key=config.storageKey, timeout=config.timeoutMs??15000;
  if(!bridge || !/^[A-Za-z0-9._-]{1,160}$/.test(key) || !Number.isSafeInteger(timeout) || timeout<1 || timeout>60000) throw fail();
  if (!(['capabilities','begin','send','cancel','read','write','remove'] as const).every(name => typeof bridge[name] === 'function')) throw fail();
  let caps: Awaited<ReturnType<NativeMemberBridge['capabilities']>>;
  try { caps=await timed(bridge.capabilities(),timeout); } catch { throw fail(); }
  if(caps?.version!==1 || caps.origin!==origin || caps.storageKey!==key || caps.redirectPolicy!=='reject-before-send' || caps.storagePolicy!=='os-protected') throw fail();
  let map=lanes.get(bridge); if(!map){map=new Map();lanes.set(bridge,map);} let lane=map.get(key);if(!lane){lane={tail:Promise.resolve(),generation:0,quarantined:false,requests:new Set(),retirements:new Set()};map.set(key,lane);}
  const queue=lane, generation=lane.generation; let retired=false;
  const current=()=>queue.generation===generation&&!queue.quarantined;
  const slot=(value:string): 'session'|'pkce'|'user' => { if(value===key)return 'session';if(value===key+'-code-verifier')return 'pkce';if(value===key+'-user')return 'user';throw fail(); };
  const enqueue=<T>(work:()=>Promise<T>, keepAfterTimeout=false) => { if(!current())return Promise.reject(fail());let expired=false; const pending=queue.tail.then(()=>{if(!current()||(expired && !keepAfterTimeout))throw fail();return work();});queue.tail=pending.then(()=>{},()=>{});return timed(pending,timeout).catch(()=>{expired=true;throw fail();}); };
  const storage={
    getItem(name:string):Promise<string|null>{const s=slot(name);return enqueue(async()=>{if(retired)throw fail();const value=await bridge.read(s);if(retired||!current()||value!==null&&(typeof value!=='string'||size(value)>65536))throw fail();return value;});},
    setItem(name:string,value:string):Promise<void>{const s=slot(name);if(typeof value!=='string'||size(value)>65536)throw fail();return enqueue(async()=>{if(retired)throw fail();await bridge.write(s,value);if(!current())throw fail();});},
    removeItem(name:string):Promise<void>{const s=slot(name);return enqueue(()=>{if(retired)throw fail();return bridge.remove(s);});},
  };
  const transport:CircleTransport=async(url,init)=>{
    let id:string|undefined;
    const lifetime=new AbortController(), signal=lifetime.signal, abortLifetime=()=>lifetime.abort();
    if(init.signal.aborted)lifetime.abort();else init.signal.addEventListener('abort',abortLifetime,{once:true});
    queue.requests.add(lifetime);
    try {
      const u=new URL(url), headers=Object.entries(init.headers), allowed=headers.every(([name])=>['authorization','content-type'].includes(name.toLowerCase()));
      const auth=headers.filter(([name])=>name.toLowerCase()==='authorization');
      const ct=headers.filter(([name])=>name.toLowerCase()==='content-type');
      const match=auth.length===1&&/^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(auth[0][1]);
      const legacy = /^\/api\/book-salons\/([^/]+)$/.exec(u.pathname), discussion = /^\/api\/circles\/([^/]+)\/discussion$/.exec(u.pathname);
      const query = parseDiscussionQuery(u.searchParams);
      const approvedPath = legacy ? isUuid(legacy[1]) && !u.search : discussion && isUuid(discussion[1]) && init.method === 'GET' && query && query.kind !== 'receipt';
      if(!current()||u.origin!==origin||u.username||u.password||u.hash||!approvedPath||!allowed||!match||match[1].length>16384||init.redirect!=='error'||init.credentials!=='omit'||init.cache!=='no-store'||signal.aborted||!['GET','POST'].includes(init.method)||ct.length>1||(init.method==='GET'&&(init.body!==undefined||ct.length!==0))||(init.method==='POST'&&(ct.length!==1||ct[0][1]!=='application/json'||typeof init.body!=='string'||size(init.body)>16384))) throw fail();
      id=await timed(bridge.begin(),timeout);if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id)||signal.aborted||!current())throw fail();
      const requestId=id;let rejectAbort: (reason: Error)=>void = () => {};const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});const abort=()=>{void Promise.resolve().then(()=>bridge.cancel(requestId)).catch(()=>{});rejectAbort(fail());};
      signal.addEventListener('abort',abort,{once:true});
      try {
        if(signal.aborted||!current())throw fail();
        const response=await timed(Promise.race([bridge.send(requestId,{url,method:init.method,bearer:match[1],...(init.body===undefined?{}:{body:init.body})}),aborted]),timeout);
        if(signal.aborted||!current()||!Number.isInteger(response.status)||response.status<100||response.status>599||response.status>=300&&response.status<400||response.redirected!==false||response.url!==url||typeof response.body!=='string'||size(response.body)>1048576)throw fail();
        return {status:response.status,url:response.url,redirected:false,json:async()=>JSON.parse(response.body)};
      } finally {signal.removeEventListener('abort',abort);}
    } catch { if(id)void Promise.resolve().then(()=>bridge.cancel(id!)).catch(()=>{});throw fail(); }
    finally {queue.requests.delete(lifetime);init.signal.removeEventListener('abort',abortLifetime);}
  };
  return { transport, storage, retireStorage(){retired=true;},
    onAccountRetired(listener:()=>void) { if(!current()){listener();return ()=>{};}queue.retirements.add(listener);return ()=>{queue.retirements.delete(listener);}; },
    async resetAccountStorage() {
      if(retired||queue.generation!==generation)throw fail();
      const transition=++queue.generation;queue.quarantined=true;for(const request of queue.requests)request.abort();for(const listener of Array.from(queue.retirements)){try{listener();}catch{}}queue.retirements.clear();let expired=false;
      const pending=queue.tail.then(async()=>{
        for(const s of ['session','pkce','user'] as const)await bridge.remove(s);
        if(expired||queue.generation!==transition)throw fail();
        queue.quarantined=false;
      });
      queue.tail=pending.then(()=>{},()=>{});
      try { await timed(pending,timeout); } catch { expired=true;throw fail(); }
    },
  };
}
