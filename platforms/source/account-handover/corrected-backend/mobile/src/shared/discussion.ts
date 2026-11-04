import { payloadHash } from '../hash.ts';

export const DISCUSSION_CONTRACT = 'plan-discussion-v1';
export const CONDUCT_REASONS = ['personal_data', 'credible_threat', 'targeted_harassment', 'spam', 'no_violation', 'insufficient_context'] as const;
export type ConductReason = typeof CONDUCT_REASONS[number];
export type ViewName = 'feed' | 'queue' | 'notices';
export type Endpoint = 'discussion-consent' | 'discussion-post' | 'discussion-flag' | 'discussion-decide' | 'discussion-appeal';
export type Reply = { http: number; body: unknown };
export type SessionScope = { actor: string; scope: string };
export interface DiscussionGateway {
  session(): SessionScope | null;
  identity(): Promise<{ contract: string; instanceId: string } | null>;
  read(view: ViewName): Promise<Reply>;
  write(endpoint: Endpoint, envelope: Record<string, unknown>): Promise<Reply>;
  lookup(envelope: Record<string, unknown>): Promise<Reply>;
}
export type Decision = { decisionId: string; action: 'keep' | 'restrict'; reasonCode: ConductReason; explanation: string; excerpt: string; stage: string; policyVersion: string };
export type Post = { postId: string; authorName: string; own: boolean; text: string | null; status: string; decision: Pick<Decision, 'action' | 'reasonCode' | 'policyVersion'> | null };
export type ReviewCase = { caseId: string; postId: string; revision: number; phase: string; text: string; suggestions: { reasonCode: ConductReason }[]; humanFlagReasons: ConductReason[]; decisions: Decision[]; appeal: { text: string } | null };
export type Notice = { caseId: string; phase: string; decisions: Decision[]; canAppeal: boolean; appealStatus: string | null };
export type Feed = { consented: boolean; posts: Post[] };
export type Queue = { assignments: { assignmentId: string; epoch: number; role: string }[]; cases: ReviewCase[] };
export type Notices = { notices: Notice[] };
type Pending = { actor: string; endpoint: Endpoint; key: string; hash: string; instanceId: string };
type DecisionDraft = { caseId: string; action: 'keep' | 'restrict'; reasonCode: ConductReason; explanation: string; excerpt: string };
export type DiscussionModel = {
  actor: string | null; phase: 'closed' | 'checking' | 'ready' | 'sending' | 'unknown' | 'denied' | 'unavailable' | 'needs-refresh' | 'ended';
  busy: boolean; active: boolean; open: boolean; canAct: boolean; message: string;
  feed: Feed | null; queue: Queue | null; notices: Notices | null; pending: Pending | null;
  postDraft: string; appealDraft: { caseId: string; text: string } | null; decisionDraft: DecisionDraft | null;
  receipt: { operation: string; outcome: string } | null;
};
const record = (x: unknown): x is Record<string, any> => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(x);
const reason = (x: unknown): x is ConductReason => CONDUCT_REASONS.includes(x as ConductReason);
const array = (x: unknown): x is unknown[] => Array.isArray(x) && x.length <= 400;
const decision = (d: unknown): d is Decision => record(d) && id(d.decisionId) && ['keep', 'restrict'].includes(d.action) && reason(d.reasonCode) && text(d.explanation,800) && text(d.excerpt,300) && text(d.stage,32) && text(d.policyVersion,100);
export function validDiscussionView(view: ViewName, reply: Reply, instanceId: string): boolean {
  const r=reply.body;
  if (!record(r) || reply.http!==200 || r.status!=='ok' || !/^[a-f0-9]{64}$/.test(r.snapshotId) || !record(r.data) || r.data.instanceId!==instanceId) return false;
  const d=r.data;
  if(view==='feed')return typeof d.consented==='boolean' && array(d.posts) && d.posts.every(p=>record(p)&&id(p.postId)&&text(p.authorName,200)&&typeof p.own==='boolean'&&(p.text===null||text(p.text,1200))&&text(p.status,100)&&(p.decision===null||record(p.decision)&&['keep','restrict'].includes(p.decision.action)&&reason(p.decision.reasonCode)&&text(p.decision.policyVersion,100)));
  if(view==='queue')return array(d.assignments)&&d.assignments.every(a=>record(a)&&id(a.assignmentId)&&Number.isSafeInteger(a.epoch)&&a.epoch>0&&['safety','safety_triage'].includes(a.role))&&array(d.cases)&&d.cases.every(c=>record(c)&&id(c.caseId)&&id(c.postId)&&Number.isSafeInteger(c.revision)&&c.revision>0&&['pending','appeal_pending'].includes(c.phase)&&text(c.text,1200)&&array(c.suggestions)&&c.suggestions.every(s=>record(s)&&reason(s.reasonCode))&&array(c.humanFlagReasons)&&c.humanFlagReasons.every(reason)&&array(c.decisions)&&c.decisions.every(decision)&&(c.appeal===null||record(c.appeal)&&text(c.appeal.text,800)));
  return array(d.notices)&&d.notices.every(n=>record(n)&&id(n.caseId)&&text(n.phase,100)&&typeof n.canAppeal==='boolean'&&(n.appealStatus===null||text(n.appealStatus,100))&&array(n.decisions)&&n.decisions.every(decision));
}
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
let keySerial=0;
const nextKey=()=>`discussion-${Date.now().toString(36)}-${++keySerial}-${Math.random().toString(36).slice(2)}`;

/** Portable state only: no DOM, React, token store, background writes or durable plaintext. */
export function createPortableDiscussion(gateway: DiscussionGateway | undefined, planId: string, newKey=nextKey) {
  if(!id(planId))throw Error('Explicit plan required');
  let generation=0, disposed=false, ended=false, hostReady=true, identity: {contract:string;instanceId:string}|null=null;
  const pendingByActor=new Map<string,Pending>(),listeners=new Set<(m:DiscussionModel)=>void>();
  let s:Omit<DiscussionModel,'actor'|'canAct'>={phase:'closed',busy:false,active:true,open:false,message:'Open discussion to check your current access.',feed:null,queue:null,notices:null,pending:null,postDraft:'',appealDraft:null,decisionDraft:null,receipt:null};
  const session=()=>gateway?.session()??null;
  function model():DiscussionModel {
    const a=session();return clone({...s,busy:s.busy||!hostReady,actor:a?.actor??null,pending:a?pendingByActor.get(a.actor)??null:null,canAct:Boolean(!disposed&&!ended&&hostReady&&a&&s.open&&s.active&&!s.busy&&!pendingByActor.has(a.actor)&&s.phase==='ready')});
  }
  const emit=()=>{if(!disposed)for(const f of listeners)f(model());};
  function clear(message:string,phase:DiscussionModel['phase']='needs-refresh') {
    generation++;s={...s,phase,busy:false,feed:null,queue:null,notices:null,postDraft:'',appealDraft:null,decisionDraft:null,receipt:null,message};emit();
  }
  function current(g:number,a:SessionScope|null){
    if(disposed||ended||g!==generation||!s.active||!s.open)return false;
    const now=session();if(!now||!a||now.actor!==a.actor||now.scope!==a.scope){clear('Session changed. Private discussion data was cleared.');return false;}return true;
  }
  async function refresh(){
    if(!gateway||ended||disposed||!hostReady||!s.active||!s.open||s.busy){if(!gateway&&!ended){clear('Discussion requires the authenticated local adapter.','unavailable');}return;}
    const g=++generation;s={...s,busy:true,phase:'checking',feed:null,queue:null,notices:null,postDraft:'',appealDraft:null,decisionDraft:null,message:'Checking current discussion access.'};emit();
    try{
      const proof=await gateway.identity();if(g!==generation||disposed||ended||!s.active||!s.open)return;
      const a=session();if(!proof||proof.contract!==DISCUSSION_CONTRACT||!/^[a-f0-9]{32}$/.test(proof.instanceId)||!a)throw Error('No authenticated discussion contract');
      if(identity&&identity.instanceId!==proof.instanceId)pendingByActor.clear();identity=proof;
      const names:ViewName[]=['feed','queue','notices'],rows=await Promise.all(names.map(v=>gateway.read(v)));if(!current(g,a))return;
      const values:{feed:Feed|null;queue:Queue|null;notices:Notices|null}={feed:null,queue:null,notices:null};
      for(let i=0;i<names.length;i++){
        const r=rows[i];if(r.http===401){clear('Session rejected. Private views were cleared.','unavailable');return;}if([403,404].includes(r.http))continue;
        if(!validDiscussionView(names[i],r,identity.instanceId))throw Error('Invalid discussion view');
        Object.assign(values,{[names[i]]:(r.body as {data:unknown}).data});
      }
      s={...s,...values,busy:false,phase:'ready',message:'Access checked. Suggestions require a human decision.'};emit();
    }catch{if(g===generation&&!disposed&&!ended){s={...s,busy:false,phase:'unavailable',feed:null,queue:null,notices:null,message:'Discussion unavailable. No action was confirmed.'};emit();}}
  }
  async function write(endpoint:Endpoint,extras:Record<string,unknown>){
    const a=session();if(!model().canAct||!a||!identity||!gateway)return;
    const g=++generation,body={instanceId:identity.instanceId,planId,...extras},key=newKey();if(!id(key))throw Error('Invalid intent key');
    const pending:Pending={actor:a.actor,endpoint,key,hash:payloadHash(body),instanceId:identity.instanceId};
    pendingByActor.set(a.actor,pending);s={...s,busy:true,phase:'sending',postDraft:'',appealDraft:null,decisionDraft:null,receipt:null,message:'Sending this explicit intent once.'};emit();
    try{
      const r=await gateway.write(endpoint,{personId:a.actor,idempotencyKey:key,payloadHash:pending.hash,body});if(!current(g,a))return;
      const b=r.body;
      if(r.http===200&&record(b)&&b.status==='committed'&&record(b.data)&&b.data.operation===endpoint&&b.data.planId===planId&&text(b.data.outcome,100)){
        pendingByActor.delete(a.actor);s={...s,busy:false,phase:'ready',receipt:{operation:endpoint,outcome:b.data.outcome},message:'Historical receipt found. Checking current access.'};await refresh();
      }else if([400,403,409,413,429].includes(r.http)&&record(b)&&['rejected','conflict'].includes(b.status)){
        pendingByActor.delete(a.actor);s={...s,busy:false,phase:'denied',feed:null,queue:null,notices:null,message:'Denied or changed. Refresh before another intent.'};emit();
      }else{s={...s,busy:false,phase:'unknown',feed:null,queue:null,notices:null,message:'Reply unconfirmed. Check the original receipt; nothing is retried automatically.'};emit();}
    }catch{if(current(g,a)){s={...s,busy:false,phase:'unknown',feed:null,queue:null,notices:null,message:'Reply unavailable. Check the original receipt before another intent.'};emit();}}
  }
  async function check(){
    const a=session(),p=a?pendingByActor.get(a.actor):null;if(!gateway||!a||!p||!hostReady||s.busy||!s.open||!s.active||ended)return;
    const g=++generation;s={...s,busy:true};emit();
    try{const r=await gateway.lookup({personId:a.actor,endpoint:p.endpoint,key:p.key,payloadHash:p.hash,instanceId:p.instanceId});if(!current(g,a))return;const b=r.body;
      if(r.http===200&&record(b)&&['recorded','absent'].includes(b.status)){
        if(b.status==='recorded'&&(!record(b.result)||!record(b.result.data)||b.result.data.operation!==p.endpoint||b.result.data.planId!==planId))throw Error('Foreign receipt');
        pendingByActor.delete(a.actor);s={...s,busy:false,message:b.status==='recorded'?'Original receipt found. Nothing was resent.':'Receipt absent. Re-enter an intent only if still wanted.'};await refresh();
      }else{s={...s,busy:false,message:'Original receipt unavailable. Its key remains; nothing was resent.'};emit();}
    }catch{if(current(g,a)){s={...s,busy:false,message:'Receipt check unavailable. Nothing was resent.'};emit();}}
  }
  return {model,subscribe(f:(m:DiscussionModel)=>void){listeners.add(f);f(model());return()=>{listeners.delete(f);};},
    async open(){if(ended||disposed)return;s.open=true;await refresh();},refresh,check,
    close(){if(ended||disposed)return;s.open=false;clear('Discussion closed; private drafts and views cleared.','closed');},
    retire(message='Plan or session access changed. Refresh discussion.'){if(!ended&&!disposed)clear(message);},
    checkingAccess(checking:boolean){if(ended||disposed)return;hostReady=!checking;clear(checking?'Plan access is being checked. Private discussion is paused.':'Plan access checked. Refresh discussion to continue.');},
    activity(state:string){if(ended||disposed)return;if(state!=='active'){s.active=false;clear('App or headset is inactive. Private views and drafts cleared.');}else{s.active=true;emit();}},
    end(){ended=true;hostReady=true;pendingByActor.clear();s.open=false;clear('Local discussion session ended. Stored server records were not deleted.','ended');},
    dispose(){disposed=true;generation++;pendingByActor.clear();listeners.clear();s={...s,feed:null,queue:null,notices:null,postDraft:'',appealDraft:null,decisionDraft:null};},
    setPost(value:string){if(model().canAct&&s.feed?.consented&&text(value,1200)){s.postDraft=value;emit();}},
    consent(enabled:boolean){return write('discussion-consent',{enabled});},
    post(){const value=s.postDraft;if(value.trim()&&text(value,1200)&&s.feed?.consented)return write('discussion-post',{text:value});},
    flag(postId:string,reasonCode:ConductReason){if(s.feed?.posts.some(p=>p.postId===postId&&!p.own&&p.text!==null)&&reason(reasonCode)&&!['no_violation','insufficient_context'].includes(reasonCode))return write('discussion-flag',{postId,reasonCode});},
    selectAppeal(caseId:string){if(model().canAct&&s.notices?.notices.some(n=>n.caseId===caseId&&n.canAppeal)){s.appealDraft={caseId,text:''};emit();}},
    setAppeal(value:string){if(model().canAct&&s.appealDraft&&text(value,800)){s.appealDraft.text=value;emit();}},
    appeal(){const d=s.appealDraft,n=s.notices?.notices.find(n=>n.caseId===d?.caseId&&n.canAppeal);if(d?.text.trim()&&n?.decisions.length)return write('discussion-appeal',{caseId:n.caseId,decisionId:n.decisions[n.decisions.length-1].decisionId,text:d.text});},
    selectCase(caseId:string){if(model().canAct&&s.queue?.cases.some(c=>c.caseId===caseId)){s.decisionDraft={caseId,action:'keep',reasonCode:'no_violation',explanation:'',excerpt:''};emit();}},
    setDecision(value:Partial<Omit<DecisionDraft,'caseId'>>){if(!model().canAct||!s.decisionDraft)return;const d={...s.decisionDraft,...value};if(['keep','restrict'].includes(d.action)&&reason(d.reasonCode)&&text(d.explanation,800)&&text(d.excerpt,300)){s.decisionDraft=d;emit();}},
    decide(){const d=s.decisionDraft,row=s.queue?.cases.find(r=>r.caseId===d?.caseId),a=s.queue?.assignments[0];if(!d||!row||!a||d.explanation.trim().length<20)return;
      if(d.action==='restrict'?['no_violation','insufficient_context'].includes(d.reasonCode)||d.excerpt.trim().length<3||!row.text.includes(d.excerpt):!['no_violation','insufficient_context'].includes(d.reasonCode))return;
      return write('discussion-decide',{...d,expectedRevision:row.revision,assignmentId:a.assignmentId,expectedEpoch:a.epoch});},
  };
}
export type PortableDiscussion=ReturnType<typeof createPortableDiscussion>;

/** Existing session is supplied by its owner. This adapter never signs in or invents authority. */
export function createDiscussionGateway(session:()=>SessionScope|null,request:(path:string,body?:Record<string,unknown>)=>Promise<Reply>,planId:string):DiscussionGateway {
  return {session,async identity(){const r=await request('/local-fixture.json');return r.http===200&&record(r.body)&&r.body.synthetic===true&&r.body.localOnly===true&&record(r.body.discussion)?r.body.discussion as {contract:string;instanceId:string}:null;},
    read:view=>request(`/api/plans/${encodeURIComponent(planId)}/discussion?view=${view}`),write:(endpoint,body)=>request(`/api/writes/${endpoint}`,body),lookup:body=>request('/api/lookup',body)};
}
