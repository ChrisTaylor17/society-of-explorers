import {createCircleHost} from './circle-host.mjs';

const required=['circle-host-status','circle-read-status','circle-title','circle-refresh','circle-close','circle-conversation','circle-messages','circle-draft','circle-remaining','circle-write-status','circle-post','circle-clear','circle-new','circle-composer','circle-archive-open','circle-archive','circle-archive-status','circle-archive-messages','circle-archive-next'];
// Older configured pages retain read/flat-composer support. The keyed writer
// is optional as a complete island; partial markup must never half-mount it.
const threadControls=['circle-thread-write','circle-thread-new','circle-thread-target','circle-thread-draft','circle-thread-remaining','circle-thread-status','circle-thread-review','circle-thread-preview','circle-thread-preview-parent','circle-thread-preview-content','circle-thread-confirm','circle-thread-post','circle-thread-edit','circle-thread-check','circle-thread-retry','circle-thread-cancel','circle-thread-saved'];
export function assertCircleMarkup(doc) {
  if(required.some(id=>!doc.getElementById(id)))throw Error('Circle controls unavailable');
  const present=threadControls.filter(id=>doc.getElementById(id)).length;
  if(present&&present!==threadControls.length)throw Error('Discussion writing controls unavailable');
}

/** Existing authenticated application code supplies config. No token input,
 * global credential object, URL credential, synthetic login or persistence. */
export function mountCirclePage({window:win,document:doc,config}) {
  assertCircleMarkup(doc);
  const $=id=>doc.getElementById(id),hasThreadWriter=threadControls.every(id=>$(id));
  let host=null;
  try { if(config)host=createCircleHost(config); } catch { /* Fail closed without exposing configuration. */ }
  const text=(tag,value)=>{const e=doc.createElement(tag);e.textContent=value;return e;};
  const render=m=>{
    const read=m?.participation.read,write=m?.participation.write,archive=m?.archive,thread=m?.threadWrite;
    $('circle-host-status').textContent=m?.status??'Circle access is not connected. An existing member session and approved HTTPS transport are required.';
    $('circle-read-status').textContent=archive?.open?'':read?.message??'';
    $('circle-title').textContent=read?.conversation?.title??'A conversation worth having.';
    const canRead=Boolean(m?.connected&&m.active&&m.online&&!read?.busy&&!write?.busy&&!archive?.busy&&thread?.canNavigate!==false);
    $('circle-refresh').disabled=!canRead;
    $('circle-close').disabled=!m?.connected;
    $('circle-archive-open').disabled=!canRead;
    $('circle-conversation').hidden=Boolean(archive?.open)||!read?.conversation;
    $('circle-messages').replaceChildren(...(read?.conversation?.messages.map(message=>{
      const article=doc.createElement('article');article.append(text('strong',message.member_name+(message.is_mine?' · You':'')),text('p',message.created_at),text('p',message.content));return article;
    })??[]));
    $('circle-composer').hidden=Boolean(archive?.open);
    $('circle-draft').value=write?.draft??'';$('circle-draft').disabled=!write?.canEdit||thread?.canNavigate===false;
    $('circle-remaining').textContent=`${write?.remaining??2000} characters remaining`;
    $('circle-write-status').textContent=write?.message??'Refresh current membership before writing.';
    $('circle-post').disabled=!write?.canSend||thread?.canNavigate===false;$('circle-post').textContent=write?.busy?'Posting to circle…':'Post to circle';
    $('circle-clear').disabled=!write?.canEdit||!write?.draft||thread?.canNavigate===false;
    $('circle-new').hidden=!write?.canStartNew;$('circle-new').disabled=thread?.canNavigate===false;
    $('circle-archive').hidden=!archive?.open;
    $('circle-archive-status').textContent=archive?.message??'';
    const cards=[],page=archive?.page;
    const card=message=>{
      const article=doc.createElement('article');article.dataset.messageId=message.id;article.append(text('strong',message.member_name+(message.is_mine?' · You':'')));
      if(message.created_at)article.append(text('p',message.created_at));
      article.append(text('p',message.content??(message.visibility==='withdrawn'?'This contribution was withdrawn.':message.visibility==='hidden'?'This contribution is restricted by moderation.':'This contribution is unavailable.')));
      const button=text('button','Open thread');button.type='button';button.disabled=!canRead;button.addEventListener('click',()=>void host?.archiveThread(message.id));article.append(button);
      if(hasThreadWriter&&message.visibility==='visible'){
        const reply=text('button','Reply to this message');reply.type='button';reply.disabled=!thread?.canStart;
        reply.addEventListener('click',()=>host?.threadStart(message.id));article.append(reply);
      }
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
      $('circle-thread-new').disabled=!thread?.canStart;
      $('circle-thread-target').textContent=thread?.target?'Reply to the selected visible contribution.':'A new discussion root.';
      $('circle-thread-draft').value=thread?.draft??'';$('circle-thread-draft').disabled=!thread?.canEdit;
      $('circle-thread-draft').maxLength=thread?.commentLimit??2000;
      $('circle-thread-remaining').textContent=`${Math.max(0,(thread?.commentLimit??2000)-(thread?.draft.length??0))} characters remaining`;
      $('circle-thread-status').textContent=thread?.message??'Check current membership and open the archive before writing.';
      $('circle-thread-review').disabled=!thread?.canReview;
      $('circle-thread-preview').hidden=!thread?.preview;
      $('circle-thread-preview-parent').textContent=thread?.preview?.parent?.message.content??'';
      $('circle-thread-preview-content').textContent=thread?.preview?.content??'';
      $('circle-thread-confirm').checked=Boolean(thread?.confirmed);$('circle-thread-confirm').disabled=thread?.phase!=='review';
      $('circle-thread-post').disabled=!thread?.canPost;
      $('circle-thread-edit').disabled=thread?.phase!=='review';
      $('circle-thread-check').hidden=!thread?.canCheck;$('circle-thread-check').disabled=!thread?.canCheck;
      $('circle-thread-retry').hidden=!thread?.canRetry;$('circle-thread-retry').disabled=!thread?.canRetry;
      $('circle-thread-cancel').disabled=!thread?.canCancel;
      $('circle-thread-saved').hidden=!thread?.receipt;$('circle-thread-saved').disabled=!thread?.receipt||!canRead;
    }
  };
  const handlers=[];let off=()=>{},disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;
    for(const stop of [()=>host?.disconnect(),()=>off(),...handlers]){try{stop();}catch{/* Other cleanup must still run if the host/DOM changed. */}}
    handlers.length=0;
    for(const id of ['circle-messages','circle-archive-messages','circle-thread-preview-parent','circle-thread-preview-content']){try{$(id)?.replaceChildren();}catch{}}
    for(const id of ['circle-draft','circle-thread-draft'])if($(id))$(id).value='';
    if($('circle-thread-confirm'))$('circle-thread-confirm').checked=false;
    if($('circle-thread-write'))$('circle-thread-write').hidden=true;
    if($('circle-title'))$('circle-title').textContent='A conversation worth having.';
    if($('circle-archive'))$('circle-archive').hidden=true;
    if($('circle-conversation'))$('circle-conversation').hidden=true;
  };
  try {
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
