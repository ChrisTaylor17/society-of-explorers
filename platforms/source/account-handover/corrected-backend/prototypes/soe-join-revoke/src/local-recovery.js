import {createHash} from 'node:crypto';

export const LOCAL_RECOVERY_CONTRACT='local-session-recovery-v1';
export const RECOVERY_PAGE_LIMIT=20;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const id=x=>typeof x==='string'&&/^[A-Za-z0-9._:-]{1,100}$/.test(x);
const version=x=>Number.isSafeInteger(x)&&x>=0;
const denied=()=>({status:'rejected',error:'invalid_recovery_request'});
const conflict=()=>({status:'conflict',error:'recovery_scope_changed'});
const scopeFor=(instance,token)=>createHash('sha256').update(LOCAL_RECOVERY_CONTRACT+'\0'+instance+'\0'+token).digest('hex');

/** Synchronous, internal domain helper. The world owns the transaction, gate and
 * collections. This is not a provider verifier or a production identity system. */
export function createLocalRecovery({collections,gate,instanceId}){
  const {sessions,plans,invitations,idempotency}=collections;
  const envelope=()=>({contract:LOCAL_RECOVERY_CONTRACT,identityAssurance:'synthetic-local-only',productionClearance:false});
  const identity=(token,person)=>{
    const row=sessions.get(token);
    return {issuer:`urn:soe:synthetic-world:${instanceId()}`,subject:person.id,instanceId:instanceId(),scope:scopeFor(instanceId(),token),issuedAt:row.issuedAt,expiresAt:row.expiresAt};
  };
  return {
    context(token){
      const g=gate(token);if(g.error)return g.error;
      return {status:'ok',...envelope(),data:identity(token,g.person)};
    },
    receipts(token,input){
      const g=gate(token);if(g.error)return g.error;
      if(!exact(input,['instanceId','planId','limit','cursor'])||!id(input.planId)||!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>RECOVERY_PAGE_LIMIT)return denied();
      if(input.instanceId!==instanceId())return conflict();
      const plan=plans.get(input.planId);if(!plan)return {status:'unavailable',blocker:'Recovery plan unavailable.'};
      if(plan.hostId!==g.person.id&&![...invitations.values()].some(i=>i.planId===input.planId&&i.requesterId===g.person.id))return {status:'unavailable',blocker:'Recovery plan unavailable.'};
      let through=plan.version,after=0;
      if(input.cursor!==null){
        const c=input.cursor;
        if(!exact(c,['instanceId','subject','planId','throughVersion','afterVersion'])||!version(c.throughVersion)||!version(c.afterVersion)||c.afterVersion>c.throughVersion)return denied();
        if(c.instanceId!==instanceId()||c.subject!==g.person.id||c.planId!==input.planId||c.throughVersion>plan.version)return conflict();
        through=c.throughVersion;after=c.afterVersion;
      }
      const entries=[];
      for(const [storeKey,stored] of idempotency){
        const [actor,endpoint,...keyParts]=storeKey.split('\0');
        if(actor!==g.person.id||endpoint!=='leave')continue;
        const result=stored.result,d=result?.data;
        if(d?.planId!==input.planId||result.version<=after||result.version>through)continue;
        const key=keyParts.join('\0'),invite=invitations.get(d.invitationId);
        if(!id(key)||!exact(stored,['payloadHash','result'])||!/^[a-f0-9]{64}$/.test(stored.payloadHash)||result.status!=='committed'||!Number.isSafeInteger(result.version)||result.version<1||
            d.operation!=='leave'||!id(d.invitationId)||invite?.requesterId!==g.person.id||invite.planId!==input.planId||!['left','withdrawn'].includes(d.outcome))throw Error('Invalid recovery receipt; details omitted');
        // Reconstruct a whitelist. Never return stored limit strings, write
        // bodies, reports, posts, review evidence, other actors or credentials.
        entries.push({key,payloadHash:stored.payloadHash,endpoint:'leave',historical:true,receipt:{status:'committed',version:result.version,data:{operation:'leave',planId:input.planId,invitationId:d.invitationId,outcome:d.outcome}}});
      }
      entries.sort((a,b)=>a.receipt.version-b.receipt.version||a.key.localeCompare(b.key));
      // A leave bumps its one plan's version. Refuse ambiguous pagination if a
      // malformed checkpoint contains two different leaves at the same version.
      for(let i=1;i<entries.length;i++)if(entries[i].receipt.version===entries[i-1].receipt.version)throw Error('Invalid recovery ordering; details omitted');
      const page=entries.slice(0,input.limit),next=entries.length>page.length?{instanceId:instanceId(),subject:g.person.id,planId:input.planId,throughVersion:through,afterVersion:page.at(-1).receipt.version}:null;
      return {status:'ok',...envelope(),data:{instanceId:instanceId(),subject:g.person.id,planId:input.planId,throughVersion:through,observedVersion:plan.version,entries:page,nextCursor:next,complete:next===null,absenceMeaning:'No matching committed receipt in this bounded snapshot; this does not prove an earlier request was never sent.'}};
    },
    end(token,input){
      const g=gate(token);if(g.error)return g.error;
      if(!exact(input,['instanceId','scope']))return denied();
      const current=identity(token,g.person);
      if(input.instanceId!==current.instanceId||input.scope!==current.scope)return conflict();
      sessions.delete(token);
      return {status:'ok',...envelope(),data:{ended:true,scope:current.scope,limit:'This server session ended. Membership, stored history and the identity provider session were not changed.'}};
    },
  };
}
