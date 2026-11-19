import {createMessageClient} from './message-client.mjs';
import {createDiscussionClient} from './discussion-client.mjs';
import {bindDiscussionPane} from './discussion-view.mjs';
import {bindMessagePane} from './message-view.mjs';
import {createFieldRenderer} from './field-render.mjs';
import {createPlanClient,PLAN,ACTORS} from './plan-client.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderPlan(s,proposal=null,{messaging=false}={}){
  const d=s.plan?.data,m=s.membership?.data,disabled=s.busy||Boolean(s.pending)||Boolean(s.sessionIssue),button=(label,action,extra='')=>`<button data-action="${action}" ${extra} ${disabled?'disabled':''}>${label}</button>`;
  return `<header><span class="eyebrow">SOCIETY OF EXPLORERS</span><span class="badge">Synthetic · local only</span><h1>One plan. Your choice.</h1><p>Fictional people and contact values. ${messaging?'Local synthetic text only. No real booking or delivery service.':'No real booking or messaging.'}</p></header>
  <section aria-label="Fictional identity"><h2>${s.sessionIssue?'Session ended for '+esc(s.sessionIssue.actor):s.actor?(s.authenticated?'Signed in as ':s.phase==='signing-in'?'Signing in as ':'Not signed in as ')+esc(s.actor):'Choose a fictional person'}</h2><div class="actions">${ACTORS.map(a=>`<button data-action="signin" data-actor="${a}" ${s.busy?'disabled':''}>${a==='ada'?'Ada · host':a==='jules'?'Jules · guest':'Mina · outsider'}</button>`).join('')}${s.actor?'<button data-action="signout">Sign out</button>':''}</div><p class="fine">This fixture allows one active session per person. Signing in here replaces their older session, including another tab. Draft text stays only in the open tab and is cleared on session rejection or identity change.</p></section>
  ${s.sessionIssue?`<section class="notice" aria-label="Session recovery"><h2>Sign in again to continue</h2><p>The session expired or was replaced by another sign-in. Signing in here replaces that person's other session.</p><p>Unsent text was cleared for privacy. Original action keys remain tied to their actor in this tab. After sign-in, check the original receipt before retrying; nothing is sent automatically.</p><button data-action="reauthenticate" ${s.busy?'disabled':''}>Sign in again as ${esc(s.sessionIssue.actor)}</button></section>`:''}
  <div class="notice" role="status"><strong>${esc(s.phase)}</strong><p>${esc(s.message)}</p></div>
  ${s.actor?`<section><div class="actions">${button('Refresh current state','refresh')}${s.pending?`<button data-action="reconcile" ${s.busy||s.sessionIssue?'disabled':''}>Check original receipt</button>${s.pending.canRetry?button('Retry same request','retry'):''}`:''}</div><p>Membership: <strong>${esc(m?.status??'unverified')}</strong></p>${m?.canLeave?button(m.status==='invited'?'Withdraw request':'Leave plan','leave',`data-invitation-id="${esc(m.invitationId)}"`):''}${s.receipt?`<p class="receipt">Historical ${esc(s.receipt.endpoint)} receipt: ${esc(s.receipt.outcome)} (version ${esc(s.receipt.version)}). A receipt is not current access.</p>`:''}</section>`:''}
  ${proposal?`<section aria-label="Confirm participation exit"><h2>${proposal.status==='invited'?'Withdraw this request?':'Leave this plan?'}</h2><p>This exact participation will end. Future contact access stops; previously seen copies and historical records remain.</p><div class="actions">${button(proposal.status==='invited'?'Confirm withdrawal':'Confirm leave','confirm-leave',`data-invitation-id="${esc(proposal.invitationId)}"`)}${button('Keep participation','cancel-leave')}</div></section>`:''}
  ${d?`<section><span class="eyebrow">THE FICTIONAL PLAN</span><h2>${esc(d.title)}</h2><p>${esc(d.whenLabel)} · ${esc(d.placeLabel)}</p><p>Host: ${esc(d.hostName)}</p><p>Request: ${esc(d.invitationStatus)} · Contact: ${esc(d.contactAccess)}</p><p>${esc(d.other.contactReason)}</p>${d.other.contact?`<p class="contact">${esc(d.other.contact)}</p>`:''}<div class="actions">${d.role==='visitor'&&s.actor!=='ada'?button('Request to join','join'):''}${d.canAccept?button('Accept this request','accept',`data-invitation-id="${esc(d.invitationId)}"`):''}${d.other.canGrant?button('Share my contact','grant',`data-invitation-id="${esc(d.invitationId)}"`):''}${d.other.canRevoke?button('Revoke my contact grant','revoke'):''}</div><p class="fine">Contact consent is separate from joining. Revoking contact does not leave the plan. Leaving ends participation and requires fresh acceptance and consent to rejoin.</p></section>`:''}
  ${s.actor?`<section><h2>Safety choices</h2><p>Reporting does not block contact or create a hold. This fixture provides no human review or response-time service.</p><label>Fictional subject <select id="subject" ${s.sessionIssue?'disabled':''}>${ACTORS.filter(a=>a!==s.actor).map(a=>`<option value="${a}">${a}</option>`).join('')}</select></label><div class="actions">${button('Block subject','block')}</div><label>Synthetic report details <textarea id="details" ${s.sessionIssue?'disabled':''} maxlength="2000" placeholder="Made-up test details only"></textarea></label>${button('Store local report','report')}</section>`:''}
  <footer>Leaving does not erase historical records or recall copies already seen. ${messaging?'Future message access stops; stored history remains. No production service.':'No seat inventory, host departure, messaging or production service.'}</footer>`;
}
export function bindPlanApp(root,client,{confirm=()=>false,messaging=false}={}) {
  let proposal=null,binding=null,actorScope=null,formGeneration=0;const fields=createFieldRenderer(root);
  const render=s=>{if(proposal&&(s.actor!==proposal.actor||s.membership?.data.invitationId!==proposal.invitationId||!s.membership?.data.canLeave||s.busy||s.pending))proposal=null;
   const a=client.auth?.()??{actor:s.actor,scope:0,authenticated:Boolean(s.actor)},scope=a.authenticated?JSON.stringify([a.actor,a.scope]):null;
   if(scope!==actorScope){binding=null;actorScope=scope;formGeneration++;}
   if(scope&&s.membership&&!s.busy)binding=JSON.stringify([scope,PLAN,s.membership.data.invitationId??s.plan?.data.invitationId??null,s.membership.data.status,s.plan?.data.other.personId??null]);
   else if(!s.busy||!['checking','sending'].includes(s.phase))binding=null;
   fields.render(renderPlan(s,proposal,{messaging}),[{id:'subject',scope:binding,enabled:Boolean(binding),initial:ACTORS.find(x=>x!==s.actor)??''},{id:'details',scope:binding,enabled:Boolean(binding)}],formGeneration);
  };
  const stopIntent=client.onIntent?.(({endpoint})=>{if(['leave','block','delete-account','report'].includes(endpoint))formGeneration++;});
  const stop=client.subscribe(render);
  const handler=async event=>{
    const target=event.target.closest?.('[data-action]');if(!target||target.disabled)return;
    const a=target.dataset.action,s=client.view(),d=s.plan?.data,m=s.membership?.data;
    if(a==='signin')return client.signIn(target.dataset.actor);
    if(a==='signout')return client.signOut();
    if(a==='reauthenticate')return client.reauthenticate?.();
    if(['refresh','reconcile','retry'].includes(a))return client[a]();
    if(a==='leave'){if(!m?.canLeave||s.busy||s.pending||target.dataset.invitationId!==m.invitationId)return;proposal={actor:s.actor,invitationId:m.invitationId,status:m.status};render(s);return;}
    if(a==='cancel-leave'){proposal=null;render(s);return;}
    if(a==='confirm-leave'){const selected=proposal;proposal=null;render(s);if(!selected||s.actor!==selected.actor||!m?.canLeave||m.invitationId!==selected.invitationId||target.dataset.invitationId!==selected.invitationId)return;return client.act('leave',{planId:PLAN,invitationId:selected.invitationId});}
    if(a==='join')return client.act('join',{planId:PLAN});
    if(a==='accept'&&d?.canAccept&&target.dataset.invitationId===d.invitationId)return client.act('accept',{planId:PLAN,requesterId:d.other.personId,invitationId:d.invitationId});
    if(a==='grant'&&d?.other.canGrant&&target.dataset.invitationId===d.invitationId)return client.act('grant',{planId:PLAN,otherId:d.other.personId,invitationId:d.invitationId});
    if(a==='revoke'&&d?.other.myGrantId)return client.act('revoke',{permissionId:d.other.myGrantId});
    const subject=root.querySelector('#subject')?.value;
    if(a==='block'&&ACTORS.includes(subject)&&subject!==s.actor&&confirm('Block this fictional person? Blocking withdraws any invited or accepted participation between you and this person, revokes active contact grants in both directions, and stops new invitations and future contact and message access between you. Copies already seen cannot be recalled. Stored history remains.'))return client.act('block',{otherId:subject});
    if(a==='report'&&ACTORS.includes(subject)&&subject!==s.actor)return client.act('report',{planId:PLAN,otherId:subject,category:'other',details:root.querySelector('#details')?.value??''});
  };
  root.addEventListener('click',handler);return()=>{stop();stopIntent?.();fields.dispose();root.removeEventListener('click',handler);};
}
if(typeof document!=='undefined'){
 const root=document.querySelector('#app'),core=createPlanClient({storage:sessionStorage});
 const boot=async()=>{let fixture;try{fixture=await (await fetch('/local-fixture.json',{cache:'no-store'})).json();}catch{}
  if(fixture?.messaging?.contract==='plan-messages-v1'){
   root.innerHTML='<div id="core-plan"></div><div id="message-pane"></div>';
   bindPlanApp(root.querySelector('#core-plan'),core,{confirm:text=>window.confirm(text),messaging:true});
   bindMessagePane(root.querySelector('#message-pane'),createMessageClient(core,{storage:sessionStorage}),core);
  }else if(fixture?.discussion?.contract==='plan-discussion-v1'){
   root.innerHTML='<div id="core-plan"></div><div id="discussion-pane"></div>';
   bindPlanApp(root.querySelector('#core-plan'),core,{confirm:text=>window.confirm(text)});
   bindDiscussionPane(root.querySelector('#discussion-pane'),createDiscussionClient(core,fixture.discussion));
  }else bindPlanApp(root,core,{confirm:text=>window.confirm(text)});
 };boot();
}
