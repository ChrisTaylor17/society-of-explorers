import { approvedOrigin, type CircleTransport } from './host';
import type { NativeEmailPurpose } from '../auth/email-auth-types';
import { parseDiscussionQuery } from '../../../../lib/circles/thread';
import { isUuid } from '../../../../lib/ids/uuid';
import { discoveryPageSearchParams, parseDiscoveryPageRequest } from '../../../../lib/circles/discovery-page';
import { passageIndexPin } from '../../../../lib/books/passages';
import { parseCircleAttendanceMutation, circleAttendanceMutationBody, CIRCLE_ATTENDANCE_BODY_MAX_BYTES } from '../../../../lib/circles/membership';
import { parseCircleCreateMutation, circleCreateMutationBody, parseCircleCompleteMutation, circleCompleteMutationBody,
  CIRCLE_CREATE_BODY_MAX_BYTES, CIRCLE_COMPLETE_BODY_MAX_BYTES } from '../../../../lib/circles/hosting';
import { parseProfileMutation } from '../../../../lib/members/profile';
import { parseMessageAiConsentInput } from '../../../../lib/circles/message-ai-consent';
import { validateMessageReviewRequest, MESSAGE_REVIEW_BODY_MAX_BYTES } from '../../../../lib/circles/message-review-wire';
import { parseReadingProgressMutation, readingProgressMutationBody, READING_PROGRESS_BODY_MAX_BYTES } from '../../../../lib/books/reading-progress';

/** The native implementation owns the durable storage generation. Every storage
 * operation and allocated request is fenced by that generation across JS restarts. */
export type NativeMemberBridge = {
  capabilities(): Promise<{ version: number; origin: string; storageKey: string; redirectPolicy: string; storagePolicy: string; storageGeneration: string; requestIdPolicy?: string; authPolicy?: string; providerOrigin?: string; publishableKey?: string; emailAuthPolicy?: string; emailCallbackUrl?: string; publicPolicy?: string; readingPolicy?: string; profilePolicy?: string; publicProfilePolicy?: string; savedReadingPolicy?: string; attendancePolicy?: string; hostingPolicy?: string; messageAiConsentPolicy?: string; messageReviewPolicy?: string }>;
  newRequestId?(generation: string): Promise<string>;
  begin(generation: string): Promise<string>;
  send(id: string, request: { url: string; method: 'GET' | 'POST'; bearer: string; body?: string }): Promise<{ status: number; url: string; body: string; redirected: boolean }>;
  sendReview?(id: string, request: { url: string; method: 'GET' | 'POST'; bearer: string; body?: string }): Promise<{ status: number; url: string; body: string; redirected: boolean }>;
  sendAuth?(id: string, request: { url: string; method: 'GET' | 'POST'; bearer?: string; body?: string }): Promise<{ status: number; url: string; body: string; redirected: boolean }>;
  // Native strings are untrusted until native-auth-ports validates the envelope.
  prepareEmailLink?(generation: string, purpose: NativeEmailPurpose, email: string): Promise<unknown>;
  pendingEmailLink?(generation: string): Promise<unknown>;
  claimEmailLink?(generation: string, flowId: string): Promise<unknown>;
  discardEmailLink?(generation: string, flowId: string): Promise<void>;
  sendEmailAuth?(id: string, request: { flowId: string; url: string; method: 'GET' | 'POST' | 'PUT'; bearer?: string; body?: string }): Promise<{ status: number; url: string; body: string; redirected: boolean }>;
  sendPublic?(id: string, request: { url: string; method: 'GET' }): Promise<{ status: number; url: string; body: string; redirected: boolean }>;
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
  const aiConsent = caps.messageAiConsentPolicy === 'author-message-ai-consent-v1';
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
  const makeTransport=(channel:'member'|'discovery'|'passage'|'profile'|'publicProfile'|'savedReading'|'attendance'|'hosting'|'edition'|'reviewer'):CircleTransport=>async(url,init)=>{
    const publicRead = channel === 'discovery' || channel === 'passage' || channel === 'publicProfile' || channel === 'edition';
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
      const detail = /^\/api\/circles\/([^/]+)(?:\/(membership))?$/.exec(u.pathname);
      const participation = /^\/api\/circles\/([^/]+)\/(join|leave)$/.exec(u.pathname);
      const query = parseDiscussionQuery(u.searchParams);
      const hasQuery = u.href.includes('?');
      const account = !hasQuery && (u.pathname === '/api/auth/member' && init.method === 'GET'
        || u.pathname === '/api/auth/ensure-member' && init.method === 'POST');
      const contributionQuery = Array.from(u.searchParams.entries());
      const contributions = u.pathname === '/api/circles/contributions' && init.method === 'GET'
        && (!hasQuery || Boolean(u.search)) && u.searchParams.toString() === u.search.slice(1)
        && contributionQuery.every(([name, value]) => u.searchParams.getAll(name).length === 1
          && name === 'after' && isUuid(value));
      const mine = u.pathname === '/api/circles/mine' && init.method === 'GET'
        && (!hasQuery || Boolean(u.search)) && u.searchParams.toString() === u.search.slice(1)
        && contributionQuery.every(([name, value]) => u.searchParams.getAll(name).length === 1 && name === 'after' && isUuid(value));
      let membershipChange = false;
      if (participation && isUuid(participation[1]) && init.method === 'POST' && !hasQuery && typeof init.body === 'string' && size(init.body) <= 256) {
        const body: unknown = JSON.parse(init.body);
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          const value = body as Record<string, unknown>;
          membershipChange = Object.keys(value).length === 2 && isUuid(value.requestId)
            && typeof value.expectedRevision === 'number' && Number.isSafeInteger(value.expectedRevision) && value.expectedRevision >= 0
            && init.body === JSON.stringify(value);
        }
      }
      const publicQuery = channel === 'discovery' ? parseDiscoveryPageRequest(u.searchParams) : null;
      const discovery = channel === 'discovery' && u.pathname === '/api/circles' && init.method === 'GET' && publicQuery?.ok
        && (!hasQuery || Boolean(u.search)) && discoveryPageSearchParams(publicQuery.value).toString() === u.search.slice(1);
      const pin = channel === 'passage' ? passageIndexPin(u.searchParams.get('book') ?? '') : null;
      const block = u.searchParams.get('block');
      const passage = channel === 'passage' && init.method === 'GET' && u.pathname === '/api/great-books/passage'
        && pin !== null && u.searchParams.get('edition') === pin.editionId && block !== null && /^(0|[1-9][0-9]{0,5})$/.test(block)
        && Number.isSafeInteger(Number(block)) && Number(block) < pin.blockCount
        && u.search.slice(1) === new URLSearchParams({ book: pin.bookId, edition: pin.editionId, block }).toString();
      const publicProfile = channel === 'publicProfile' && init.method === 'GET' && !hasQuery
        && /^\/api\/explorer\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(u.pathname);
      let profile = channel === 'profile' && u.pathname === '/api/members/profile' && !hasQuery && init.method === 'GET';
      if (channel === 'profile' && u.pathname === '/api/members/profile' && !hasQuery && init.method === 'POST'
        && typeof init.body === 'string' && size(init.body) <= 65536) {
        const value = parseProfileMutation(JSON.parse(init.body));
        if (value) {
          const patch = value.patch;
          const ordered = { expectedMemberId: value.expectedMemberId, expectedRevision: value.expectedRevision,
            patch: { displayName: patch.displayName, bio: patch.bio, discipline: patch.discipline, skills: patch.skills,
              projectDescription: patch.projectDescription, seeking: patch.seeking, philosophy: patch.philosophy, visibility: patch.visibility } };
          profile = Object.keys(patch).length === 8 && init.body === JSON.stringify(ordered);
        }
      }
      const savedBook = u.searchParams.get('bookId');
      let savedReading = channel === 'savedReading' && u.pathname === '/api/great-books/progress' && init.method === 'GET'
        && (!hasQuery || savedBook !== null && passageIndexPin(savedBook) !== null && u.search.slice(1) === new URLSearchParams({ bookId: savedBook }).toString());
      if (channel === 'savedReading' && u.pathname === '/api/great-books/progress' && !hasQuery && init.method === 'POST'
        && typeof init.body === 'string' && size(init.body) <= READING_PROGRESS_BODY_MAX_BYTES) {
        const value = parseReadingProgressMutation(JSON.parse(init.body));
        const savedPin = value && passageIndexPin(value.bookId);
        if (value && savedPin) savedReading = (value.action === 'remove' || value.editionId === savedPin.editionId && value.blockIndex < savedPin.blockCount)
          && init.body === readingProgressMutationBody(value);
      }
      let attendance = false;
      if (channel === 'attendance' && /^\/api\/circles\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/rsvp$/.test(u.pathname)
        && init.method === 'POST' && !hasQuery && typeof init.body === 'string' && size(init.body) <= CIRCLE_ATTENDANCE_BODY_MAX_BYTES) {
        const value = parseCircleAttendanceMutation(JSON.parse(init.body));
        attendance = value !== null && init.body === circleAttendanceMutationBody(value);
      }
      const metadataBook = /^\/api\/great-books\/text\/([a-z-]+)$/.exec(u.pathname);
      const edition = channel === 'edition' && init.method === 'GET' && !hasQuery && Boolean(metadataBook && passageIndexPin(metadataBook[1]));
      let hosting = channel === 'hosting' && !hasQuery && init.method === 'GET' && u.pathname === '/api/circles/start';
      if (channel === 'hosting' && !hasQuery && init.method === 'POST' && typeof init.body === 'string') {
        if (u.pathname === '/api/circles' && size(init.body) <= CIRCLE_CREATE_BODY_MAX_BYTES) {
          const value = parseCircleCreateMutation(JSON.parse(init.body)); hosting = value !== null && init.body === circleCreateMutationBody(value);
        } else if (/^\/api\/circles\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/complete$/.test(u.pathname) && size(init.body) <= CIRCLE_COMPLETE_BODY_MAX_BYTES) {
          const value = parseCircleCompleteMutation(JSON.parse(init.body)); hosting = value !== null && init.body === circleCompleteMutationBody(value);
        }
      }
      // The author-only consent lane carries a choice and current revision/hash,
      // never message text, reporter notes, profile details or provider requests.
      let messageAiConsent = channel === 'member' && aiConsent && !hasQuery
        && /^\/api\/circles\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/messages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/ai-consent$/.test(u.pathname);
      if (messageAiConsent && init.method === 'POST') {
        const value = typeof init.body === 'string' && size(init.body) <= 512 ? parseMessageAiConsentInput(JSON.parse(init.body)) : null;
        messageAiConsent = value !== null && init.body === JSON.stringify(value);
      }
      const reviewer = channel === 'reviewer' && (!hasQuery || Boolean(u.search))
        && validateMessageReviewRequest(u.pathname + u.search, { method: init.method, ...(init.body === undefined ? {} : { body: init.body }) });
      const bodyLimit = channel === 'reviewer' ? MESSAGE_REVIEW_BODY_MAX_BYTES : messageAiConsent ? 512 : channel === 'hosting' ? u.pathname === '/api/circles' ? CIRCLE_CREATE_BODY_MAX_BYTES : CIRCLE_COMPLETE_BODY_MAX_BYTES
        : channel === 'attendance' ? CIRCLE_ATTENDANCE_BODY_MAX_BYTES : channel === 'profile' ? 65536 : channel === 'savedReading' ? READING_PROGRESS_BODY_MAX_BYTES : 16384;
      const approvedPath = publicRead ? discovery || passage || publicProfile || edition : channel === 'reviewer' ? reviewer : channel === 'hosting' ? hosting : channel === 'profile' ? profile : channel === 'savedReading' ? savedReading : channel === 'attendance' ? attendance : messageAiConsent || account || contributions || mine || membershipChange
        || Boolean(detail && isUuid(detail[1]) && init.method === 'GET' && !hasQuery) || (legacy ? isUuid(legacy[1]) && !hasQuery
        : discussion ? isUuid(discussion[1]) && (init.method === 'GET' ? query !== null && (!hasQuery || Boolean(u.search)) : init.method === 'POST' && !hasQuery)
        : preview ? isUuid(preview[1]) && init.method === 'POST' && !hasQuery
        : message && isUuid(message[1]) && isUuid(message[2]) && !hasQuery);
      if(!current()||u.href!==url||u.origin!==origin||u.username||u.password||u.href.includes('#')||!approvedPath
        ||(publicRead ? headers.length!==0 : !allowed||!match||match[1].length>16384)
        ||init.redirect!=='error'||init.credentials!=='omit'||init.cache!=='no-store'||signal.aborted||!['GET','POST'].includes(init.method)||ct.length>1||(init.method==='GET'&&(init.body!==undefined||ct.length!==0))||(init.method==='POST'&&(ct.length!==1||ct[0][1]!=='application/json'||typeof init.body!=='string'||size(init.body)>bodyLimit))) throw fail();
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
        const transmission = publicRead ? bridge.sendPublic!(requestId,{url,method:'GET'})
          : channel === 'reviewer' ? bridge.sendReview!(requestId,{url,method:init.method,bearer:match ? match[1] : '',...(init.body===undefined?{}:{body:init.body})})
          : bridge.send(requestId,{url,method:init.method,bearer:match ? match[1] : '',...(init.body===undefined?{}:{body:init.body})});
        const response=await timed(Promise.race([transmission,aborted]),timeout);
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
  const transport = makeTransport('member');
  const reviewerTransport = caps.messageReviewPolicy === 'assigned-message-review-v1' && typeof bridge.sendReview === 'function' ? makeTransport('reviewer') : undefined;
  const publicTransport = caps.publicPolicy === 'circle-discovery-v1' && typeof bridge.sendPublic === 'function' ? makeTransport('discovery') : undefined;
  const passageTransport = caps.readingPolicy === 'pinned-passage-v1' && typeof bridge.sendPublic === 'function' ? makeTransport('passage') : undefined;
  const profileTransport = caps.profilePolicy === 'owner-profile-v1' ? makeTransport('profile') : undefined;
  const publicProfileTransport = caps.publicProfilePolicy === 'published-profile-v1' && typeof bridge.sendPublic === 'function' ? makeTransport('publicProfile') : undefined;
  const savedReadingTransport = caps.savedReadingPolicy === 'owner-reading-v1' ? makeTransport('savedReading') : undefined;
  const attendanceTransport = caps.attendancePolicy === 'circle-rsvp-v1' ? makeTransport('attendance') : undefined;
  const hostingTransport = caps.hostingPolicy === 'circle-host-v1' ? makeTransport('hosting') : undefined;
  const editionTransport = caps.hostingPolicy === 'circle-host-v1' && typeof bridge.sendPublic === 'function' ? makeTransport('edition') : undefined;
  return { transport, aiConsent, ...(reviewerTransport ? { reviewerTransport } : {}), ...(hostingTransport ? { hostingTransport } : {}), ...(editionTransport ? { editionTransport } : {}), ...(attendanceTransport ? { attendanceTransport } : {}), ...(savedReadingTransport ? { savedReadingTransport } : {}), ...(profileTransport ? { profileTransport } : {}), ...(publicProfileTransport ? { publicProfileTransport } : {}), ...(publicTransport ? { publicTransport } : {}), ...(passageTransport ? { passageTransport } : {}), storage, ...(newRequestId ? { newRequestId } : {}), retireStorage(){retired=true;},
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
