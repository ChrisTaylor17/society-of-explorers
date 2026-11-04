import {createFieldRenderer} from './field-render.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canCompose=s=>s.phase==='ready'&&s.context?.mutualConsent&&!s.busy&&!s.pending&&!s.stopPending;
export function renderMessages(s,proposal=null){const c=s.context,retryReady=s.pending?.canRetry&&!s.busy&&!s.stopping&&!s.stopPending;
 return `<section aria-label="Local plan messages"><span class="eyebrow">LOCAL PLAN MESSAGES</span><h2>Two choices before conversation</h2><p>Messaging consent is separate from joining and contact sharing. Stored locally does not mean delivered or read.</p><p role="status"><strong>${esc(s.phase)}</strong> · ${esc(s.message)}</p>
 <div class="actions"><button data-msg="refresh">Refresh plan and messages</button>${c&&!c.ownConsent&&!s.pending&&!s.stopPending&&!s.busy?'<button data-msg="enable">Enable my messaging consent</button>':''}${s.target&&!s.stopping&&!s.stopPending?'<button data-msg="prepare-stop">Stop plan messages</button>':''}</div>
 ${c?`<p>Your messaging choice: ${c.ownConsent?'enabled':'not enabled'} · Mutual messaging consent: ${c.mutualConsent?'enabled':'waiting'}</p>`:''}
 ${proposal?'<div class="notice"><p>Stop this exact conversation epoch? Both choices reset. Old text becomes unavailable through the API; previously seen copies and stored history remain.</p><button data-msg="confirm-stop">Confirm stop messages</button> <button data-msg="cancel-stop">Keep current choice</button></div>':''}
 ${s.messages.length?`<ol class="message-list">${s.messages.map(m=>`<li><strong>${esc(m.senderId)}</strong> · #${esc(m.seq)}<p class="message-text">${esc(m.text)}</p></li>`).join('')}</ol>`:''}
 ${s.hasMore&&s.phase==='ready'?'<button data-msg="next">Next page</button>':''}
 <label>Synthetic text only <textarea id="message-text" maxlength="1000" ${canCompose(s)?'':'disabled'}></textarea></label><button data-msg="send" ${canCompose(s)?'':'disabled'}>Store local post</button>
 ${s.pending?`<div class="notice"><p>A ${esc(s.pending.endpoint)} outcome needs its original-key receipt.</p><button data-msg="check">Check original message receipt</button>${s.pending.canRetry?`<label>Re-enter exact original synthetic text if needed<textarea id="retry-text" maxlength="1000" ${retryReady?'':'disabled'}></textarea></label><button data-msg="retry" ${retryReady?'':'disabled'}>Retry original request</button>`:''}</div>`:''}
 ${s.stopPending?`<div class="notice"><p>Stop outcome unconfirmed. Leave and block remain available above.</p><button data-msg="check-stop">Check original stop receipt</button>${s.stopPending.canRetry?'<button data-msg="retry-stop">Retry original stop</button>':''}</div>`:''}
 ${(s.closed??[]).map(p=>`<div class="notice"><p>Closed context has an unresolved historical ${esc(p.endpoint)} intent. It may have committed before the fence; it will not be retried.</p><button data-msg="closed" data-key="${esc(p.key)}">Check historical receipt</button></div>`).join('')}
 ${s.receipt?`<p class="receipt">Historical ${esc(s.receipt.endpoint)} receipt: ${esc(s.receipt.outcome)}${s.receipt.seq?' · #'+esc(s.receipt.seq):''}. This does not grant current access.</p>`:''}
 <p class="fine">1,000 text units; 10 posts per actor/minute, 100 per invitation and 200 per actor/fixture. Old epochs remain in local storage until the disposable fixture is reset. No edit, purge, recall, notification or human review service.</p></section>`;
}
export function bindMessagePane(root,client,core){let proposal=null;const fields=createFieldRenderer(root);
 const draw=s=>{if(proposal&&(!s.target||JSON.stringify(s.target)!==proposal||['checking','unavailable','signed-out','offline'].includes(s.phase)))proposal=null;
  const a=core.auth?.(),scope=c=>a?.authenticated&&c?JSON.stringify([a.actor,a.scope,c.instanceId,c.planId,c.invitationId,c.messagingEpoch]):null,pendingScope=scope(s.pending);
  fields.render(renderMessages(s,proposal),[{id:'message-text',scope:scope(s.target),enabled:Boolean(canCompose(s))},{id:'retry-text',scope:pendingScope?JSON.stringify([scope(s.target),pendingScope,s.pending.key,s.pending.payloadHash]):null,enabled:Boolean(a?.authenticated&&s.pending?.canRetry&&!s.busy&&!s.stopping&&!s.stopPending)}],s.composerGeneration??0);
 };const stop=client.subscribe(draw);
 const handler=async event=>{const target=event.target.closest?.('[data-msg]');if(!target||target.disabled)return;const action=target.dataset.msg;
  if(action==='refresh'){await core.refresh();return client.refresh();}
  if(action==='enable')return client.enable();if(action==='send')return client.send(root.querySelector('#message-text')?.value??'');
  if(action==='next')return client.next();if(action==='check')return client.reconcile();if(action==='retry')return client.retry('positive',root.querySelector('#retry-text')?.value);
  if(action==='check-stop')return client.reconcile('stop');if(action==='retry-stop')return client.retry('stop');
  if(action==='closed')return client.checkClosed(target.dataset.key);
  if(action==='prepare-stop'){proposal=JSON.stringify(client.view().target);draw(client.view());return;}
  if(action==='cancel-stop'){proposal=null;draw(client.view());return;}
  if(action==='confirm-stop'){const captured=proposal;proposal=null;if(captured&&JSON.stringify(client.view().target)===captured)return client.revoke();draw(client.view());}
 };root.addEventListener('click',handler);return()=>{stop();fields.dispose();root.removeEventListener('click',handler);};
}
