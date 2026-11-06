import {createCircleHost,MESSAGE_REPORT_OPTIONS,MESSAGE_WITHDRAWAL_PRIVACY} from './circle-host.mjs';

const required=['circle-host-status','circle-read-status','circle-title','circle-refresh','circle-close','circle-conversation','circle-messages','circle-draft','circle-remaining','circle-write-status','circle-post','circle-clear','circle-new','circle-composer','circle-archive-open','circle-archive','circle-archive-status','circle-archive-messages','circle-archive-next'];
// Older configured pages retain read/flat-composer support. The keyed writer
// is optional as a complete island; partial markup must never half-mount it.
const threadControls=['circle-thread-write','circle-thread-new','circle-thread-target','circle-thread-draft','circle-thread-remaining','circle-thread-status','circle-thread-review','circle-thread-preview','circle-thread-preview-parent','circle-thread-preview-content','circle-thread-confirm','circle-thread-post','circle-thread-edit','circle-thread-check','circle-thread-retry','circle-thread-cancel','circle-thread-saved'];
const safetyControls=['circle-safety','circle-safety-heading','circle-safety-status','circle-safety-message','circle-safety-explanations','circle-safety-report-fields','circle-safety-reason','circle-safety-note','circle-safety-remaining','circle-safety-privacy','circle-safety-confirm','circle-safety-confirm-label','circle-safety-report','circle-safety-withdraw','circle-safety-refresh','circle-safety-retry','circle-safety-close'];
export function assertCircleMarkup(doc) {
  if(required.some(id=>!doc.getElementById(id)))throw Error('Circle controls unavailable');
  const present=threadControls.filter(id=>doc.getElementById(id)).length;
  if(present&&present!==threadControls.length)throw Error('Discussion writing controls unavailable');
  const safetyPresent=safetyControls.filter(id=>doc.getElementById(id)).length;
  if(safetyPresent&&safetyPresent!==safetyControls.length)throw Error('Message safety controls unavailable');
  if(typeof doc.querySelectorAll==='function'&&[...required,...threadControls,...safetyControls].some(id=>doc.querySelectorAll(`[id="${id}"]`).length>1))throw Error('Duplicate Circle controls unavailable');
}

/** Existing authenticated application code supplies config. No token input,
 * global credential object, URL credential, synthetic login or persistence. */
export function mountCirclePage({window:win,document:doc,config,reelStarter}) {
  assertCircleMarkup(doc);
  const $=id=>doc.getElementById(id),hasThreadWriter=threadControls.every(id=>$(id)),hasSafety=safetyControls.every(id=>$(id));
  const reelButton=reelStarter?$('circle-thread-reel'):null;
  if(reelStarter&&(!hasThreadWriter||!reelButton||doc.querySelectorAll('#circle-thread-reel').length!==1))throw Error('Reel draft control unavailable');
  let safetyWasOpen=false,safetyMessage=null;
  let host=null,renderEpoch=0;
  try { if(config)host=createCircleHost(config); } catch { /* Fail closed without exposing configuration. */ }
  const text=(tag,value)=>{const e=doc.createElement(tag);e.textContent=value;return e;};
  const render=m=>{
    const epoch=++renderEpoch;
    const read=m?.participation.read,write=m?.participation.write,archive=m?.archive,thread=m?.threadWrite,safety=m?.messageSafety;
    const safetyNavigation=safety?.canNavigate!==false;
    $('circle-host-status').textContent=m?.status??'Circle access is not connected. An existing member session and approved HTTPS transport are required.';
    $('circle-read-status').textContent=archive?.open?'':read?.message??'';
    $('circle-title').textContent=read?.conversation?.title??'A conversation worth having.';
    const canRead=Boolean(m?.connected&&m.active&&m.online&&!read?.busy&&!write?.busy&&!archive?.busy&&thread?.canNavigate!==false&&safetyNavigation);
    const profileLink=(article,profileId)=>{
      if(!canRead||write?.phase==='unknown'||typeof profileId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(profileId))return;
      const link=text('a','View published profile');link.href=`/explorer/${profileId}`;link.referrerPolicy='no-referrer';
      link.style.minHeight='44px';link.style.display='inline-flex';link.style.alignItems='center';
      link.addEventListener('click',event=>{if(disposed||epoch!==renderEpoch)event.preventDefault();});article.append(link);
    };
    $('circle-refresh').disabled=!canRead;
    $('circle-close').disabled=!m?.connected;
    $('circle-archive-open').disabled=!canRead;
    $('circle-conversation').hidden=Boolean(archive?.open)||!read?.conversation;
    $('circle-messages').replaceChildren(...(read?.conversation?.messages.map(message=>{
      const article=doc.createElement('article');article.append(text('strong',message.member_name+(message.is_mine?' · You':'')),text('p',message.created_at),text('p',message.content));profileLink(article,message.publicProfileId);return article;
    })??[]));
    $('circle-composer').hidden=Boolean(archive?.open);
    $('circle-draft').value=write?.draft??'';$('circle-draft').disabled=!write?.canEdit||thread?.canNavigate===false||!safetyNavigation;
    $('circle-remaining').textContent=`${write?.remaining??2000} characters remaining`;
    $('circle-write-status').textContent=write?.message??'Refresh current membership before writing.';
    $('circle-post').disabled=!write?.canSend||thread?.canNavigate===false||!safetyNavigation;$('circle-post').textContent=write?.busy?'Posting to circle…':'Post to circle';
    $('circle-clear').disabled=!write?.canEdit||!write?.draft||thread?.canNavigate===false||!safetyNavigation;
    $('circle-new').hidden=!write?.canStartNew;$('circle-new').disabled=thread?.canNavigate===false||!safetyNavigation;
    $('circle-archive').hidden=!archive?.open;
    $('circle-archive-status').textContent=archive?.message??'';
    const cards=[],page=archive?.page;
    const card=message=>{
      const article=doc.createElement('article');article.dataset.messageId=message.id;article.append(text('strong',message.member_name+(message.is_mine?' · You':'')));
      if(message.created_at)article.append(text('p',message.created_at));
      article.append(text('p',message.content??(message.visibility==='withdrawn'?'This contribution was withdrawn.':message.visibility==='hidden'?'This contribution is restricted by moderation.':'This contribution is unavailable.')));
      if(message.visibility==='visible')profileLink(article,message.publicProfileId);
      const button=text('button','Open thread');button.type='button';button.disabled=!canRead;button.addEventListener('click',()=>void host?.archiveThread(message.id));article.append(button);
      if(hasThreadWriter&&message.visibility==='visible'){
        const reply=text('button','Reply to this message');reply.type='button';reply.disabled=!thread?.canStart||!safetyNavigation;
        reply.addEventListener('click',()=>host?.threadStart(message.id));article.append(reply);
      }
      if(hasSafety){const check=text('button','Check message actions');check.type='button';check.disabled=!canRead;check.addEventListener('click',()=>void host?.messageOpen(message.id));article.append(check);}
      const safety=text('a','Report or withdraw in regular view');
      safety.href=`/circles/${encodeURIComponent(config.circleId)}/discussion?message=${encodeURIComponent(message.id)}`;
      article.append(safety);return article;
    };
    if(page?.kind==='thread'){
      cards.push(text('h3','Thread'),card(page.root));
      if(page.focus.id!==page.root.id&&!page.items.some(item=>item.id===page.focus.id))cards.push(text('h3','Selected contribution'),card(page.focus));
    }
    for(const message of page?.items??[])cards.push(card(message));
    if(page&&!page.items.length)cards.push(text('p',page.kind==='thread'?'No replies in this page.':'No messages in this page.'));
    $('circle-archive-messages').replaceChildren(...cards);
    $('circle-archive-next').hidden=!page?.nextCursor;$('circle-archive-next').disabled=!canRead;
    $('circle-archive-next').textContent=page?.kind==='thread'?'Next replies':'Older messages';
    if(hasThreadWriter){
      $('circle-thread-write').hidden=!archive?.open;
      $('circle-thread-new').disabled=!thread?.canStart||!safetyNavigation;
      if(reelButton)reelButton.disabled=!canRead||safety?.open||page?.kind!=='archive'||!thread?.canStart||thread.phase!=='locked';
      $('circle-thread-target').textContent=thread?.target?'Reply to the selected visible contribution.':'A new discussion root.';
      $('circle-thread-draft').value=thread?.draft??'';$('circle-thread-draft').disabled=!thread?.canEdit||!safetyNavigation;
      $('circle-thread-draft').maxLength=thread?.commentLimit??2000;
      $('circle-thread-remaining').textContent=`${Math.max(0,(thread?.commentLimit??2000)-(thread?.draft.length??0))} characters remaining`;
      $('circle-thread-status').textContent=thread?.message??'Check current membership and open the archive before writing.';
      $('circle-thread-review').disabled=!thread?.canReview||!safetyNavigation;
      $('circle-thread-preview').hidden=!thread?.preview;
      $('circle-thread-preview-parent').textContent=thread?.preview?.parent?.message.content??'';
      $('circle-thread-preview-content').textContent=thread?.preview?.content??'';
      $('circle-thread-confirm').checked=Boolean(thread?.confirmed);$('circle-thread-confirm').disabled=thread?.phase!=='review'||!safetyNavigation;
      $('circle-thread-post').disabled=!thread?.canPost||!safetyNavigation;
      $('circle-thread-edit').disabled=thread?.phase!=='review'||!safetyNavigation;
      $('circle-thread-check').hidden=!thread?.canCheck;$('circle-thread-check').disabled=!thread?.canCheck||!safetyNavigation;
      $('circle-thread-retry').hidden=!thread?.canRetry;$('circle-thread-retry').disabled=!thread?.canRetry||!safetyNavigation;
      $('circle-thread-cancel').disabled=!thread?.canCancel||!safetyNavigation;
      $('circle-thread-saved').hidden=!thread?.receipt;$('circle-thread-saved').disabled=!thread?.receipt||!canRead;
    }
    if(hasSafety){
      $('circle-safety').hidden=!safety?.open;$('circle-safety').setAttribute('aria-busy',String(Boolean(safety?.busy)));
      $('circle-safety-status').textContent=safety?.message??'Choose a contribution and check its current message actions.';
      const state=safety?.state,checked=state?.message,details=[];
      if(checked){
        const article=doc.createElement('article');article.append(text('strong',checked.member_name+(checked.is_mine?' · You':'')),text('p',checked.created_at),text('p',checked.content??(checked.visibility==='withdrawn'?'This contribution was withdrawn.':'This contribution is restricted by moderation.')));details.push(article);
      }
      $('circle-safety-message').replaceChildren(...details);
      $('circle-safety-explanations').replaceChildren(...(state?.explanations.map(explanation=>{
        const article=doc.createElement('article'),labels=new Map(MESSAGE_REPORT_OPTIONS.map(option=>[option.value,option.label]));
        const label=labels.get(explanation.reason)??({no_violation:'No violation found',insufficient_evidence:'Insufficient evidence',resolved:'Concern resolved'}[explanation.reason]??explanation.reason);
        article.append(text('strong',(explanation.action==='hide'?'Hidden':'Moderator restriction lifted')+' · '+label),text('p',explanation.summary),text('p',explanation.created_at));return article;
      })??[]));
      $('circle-safety-report-fields').hidden=!state?.canReport;
      $('circle-safety-reason').value=safety?.reason??'';$('circle-safety-reason').disabled=!safety?.canEditReport;
      $('circle-safety-note').value=safety?.note??'';$('circle-safety-note').disabled=!safety?.canEditReport;
      $('circle-safety-remaining').textContent=`${Math.max(0,1000-(safety?.note.length??0))} characters remaining`;
      $('circle-safety-privacy').textContent=MESSAGE_WITHDRAWAL_PRIVACY;$('circle-safety-privacy').hidden=!state?.canWithdraw;
      $('circle-safety-confirm').checked=Boolean(safety?.confirmed);$('circle-safety-confirm').disabled=!safety?.canConfirm;
      $('circle-safety-confirm-label').textContent=state?.canWithdraw?'I understand withdrawal removes this message from member views and cannot be undone here.':'I checked this message and want to send this report for private human review.';
      if($('circle-safety-confirm').parentElement)$('circle-safety-confirm').parentElement.hidden=!state?.canReport&&!state?.canWithdraw;
      $('circle-safety-report').hidden=!state?.canReport;$('circle-safety-report').disabled=!safety?.canReport;
      $('circle-safety-withdraw').hidden=!state?.canWithdraw;$('circle-safety-withdraw').disabled=!safety?.canWithdraw;
      $('circle-safety-refresh').disabled=!safety?.canCheck;
      $('circle-safety-retry').hidden=!safety?.canRetry;$('circle-safety-retry').disabled=!safety?.canRetry;
      $('circle-safety-retry').textContent=safety?.pendingAction==='withdraw'?'Retry exact withdrawal':'Retry exact report';
      $('circle-safety-close').disabled=!safety?.canClose;
      if(safety?.open&&(!safetyWasOpen||safetyMessage!==safety.messageId))$('circle-safety-heading').focus();
      safetyWasOpen=Boolean(safety?.open);safetyMessage=safety?.messageId??null;
    }
  };
  const handlers=[];let off=()=>{},disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;
    for(const stop of [()=>host?.disconnect(),()=>off(),...handlers]){try{stop();}catch{/* Other cleanup must still run if the host/DOM changed. */}}
    handlers.length=0;
    for(const id of ['circle-messages','circle-archive-messages','circle-thread-preview-parent','circle-thread-preview-content','circle-safety-message','circle-safety-explanations']){try{$(id)?.replaceChildren();}catch{}}
    for(const id of ['circle-draft','circle-thread-draft','circle-safety-note','circle-safety-reason'])if($(id))$(id).value='';
    if($('circle-thread-confirm'))$('circle-thread-confirm').checked=false;
    if(reelButton)reelButton.disabled=true;
    if($('circle-safety-confirm'))$('circle-safety-confirm').checked=false;
    if($('circle-safety'))$('circle-safety').hidden=true;
    if($('circle-thread-write'))$('circle-thread-write').hidden=true;
    if($('circle-title'))$('circle-title').textContent='A conversation worth having.';
    if($('circle-archive'))$('circle-archive').hidden=true;
    if($('circle-conversation'))$('circle-conversation').hidden=true;
  };
  try {
  if(hasSafety){const placeholder=text('option','Choose a reason');placeholder.value='';$('circle-safety-reason').replaceChildren(placeholder,...MESSAGE_REPORT_OPTIONS.map(option=>{const element=text('option',option.label);element.value=option.value;return element;}));}
  off=host?.subscribe(render)??(()=>{});
  const listen=(target,name,callback)=>{target.addEventListener(name,callback);handlers.push(()=>target.removeEventListener(name,callback));};
  listen($('circle-refresh'),'click',()=>void host?.refresh());
  listen($('circle-archive-open'),'click',()=>void host?.openArchive());
  listen($('circle-archive-next'),'click',()=>void host?.archiveNext());
  listen($('circle-post'),'click',()=>void host?.post());
  listen($('circle-clear'),'click',()=>host?.clearDraft());
  listen($('circle-new'),'click',()=>host?.startNewAfterReview());
  listen($('circle-draft'),'input',()=>{host?.edit($('circle-draft').value);if(host)render(host.model());});
  if(hasThreadWriter){
    listen($('circle-thread-new'),'click',()=>host?.threadStart(null));
    if(reelButton)listen(reelButton,'click',()=>{
      if(!reelButton.disabled&&host?.model().threadWrite.phase==='locked'&&host.threadStart(null)){
        host.threadEdit(reelStarter.draft);$('circle-thread-draft').focus();
      }
    });
    listen($('circle-thread-draft'),'input',()=>{host?.threadEdit($('circle-thread-draft').value);if(host)render(host.model());});
    listen($('circle-thread-review'),'click',()=>void host?.threadReview());
    listen($('circle-thread-confirm'),'change',()=>host?.threadConfirm($('circle-thread-confirm').checked));
    listen($('circle-thread-post'),'click',()=>void host?.threadPost());
    listen($('circle-thread-edit'),'click',()=>host?.threadEditReview());
    listen($('circle-thread-check'),'click',()=>void host?.threadLookup());
    listen($('circle-thread-retry'),'click',()=>void host?.threadRetry());
    listen($('circle-thread-cancel'),'click',()=>host?.threadCancel());
    listen($('circle-thread-saved'),'click',()=>{const receipt=host?.model().threadWrite?.receipt;if(receipt)void host.archiveThread(receipt.message.id);});
  }
  if(hasSafety){
    listen($('circle-safety-reason'),'change',()=>{host?.messageReason($('circle-safety-reason').value);if(host)render(host.model());});
    listen($('circle-safety-note'),'input',()=>{host?.messageNote($('circle-safety-note').value);if(host)render(host.model());});
    listen($('circle-safety-confirm'),'change',()=>host?.messageConfirm($('circle-safety-confirm').checked));
    listen($('circle-safety-report'),'click',()=>void host?.messageSubmit('report'));
    listen($('circle-safety-withdraw'),'click',()=>void host?.messageSubmit('withdraw'));
    listen($('circle-safety-refresh'),'click',()=>void host?.messageRefresh());
    listen($('circle-safety-retry'),'click',()=>void host?.messageRetry());
    listen($('circle-safety-close'),'click',()=>{host?.messageClose();$('circle-archive-open').focus();});
  }
  listen($('circle-close'),'click',()=>{host?.close();$('circle-refresh').focus();});
  let focused=doc.hasFocus(),visible=doc.visibilityState==='visible';
  const activity=()=>host?.activity(visible&&focused);
  listen(win,'blur',()=>{focused=false;activity();});listen(win,'focus',()=>{focused=true;activity();});
  listen(doc,'visibilitychange',()=>{visible=doc.visibilityState==='visible';activity();});
  listen(win,'offline',()=>host?.connectivity(false));listen(win,'online',()=>host?.connectivity(true));
  listen(win,'pagehide',dispose);
  host?.connect();activity();host?.connectivity(win.navigator.onLine!==false);
  if(host)void host.refresh();else render(null);
  return {host,dispose};
  } catch {dispose();throw Error('Circle could not be opened');}
}
/** Standard browser fetch enforces redirect:error before forwarding a bearer.
 * This function is intentionally never selected by the React Native screen. */
export function browserCircleTransport(win) { return (url,init)=>win.fetch(url,{...init,mode:'cors',referrerPolicy:'no-referrer'}); }
