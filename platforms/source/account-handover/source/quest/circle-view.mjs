import {createCircleHost} from './circle-host.mjs';

/** Existing authenticated application code supplies config. No token input,
 * global credential object, URL credential, synthetic login or persistence. */
export function mountCirclePage({window:win,document:doc,config}) {
  const $=id=>doc.getElementById(id);
  let host=null;
  try { if(config)host=createCircleHost(config); } catch { /* Fail closed without exposing configuration. */ }
  const text=(tag,value)=>{const e=doc.createElement(tag);e.textContent=value;return e;};
  const render=m=>{
    const read=m?.participation.read,write=m?.participation.write;
    $('circle-host-status').textContent=m?.status??'Circle access is not connected. An existing member session and approved HTTPS transport are required.';
    $('circle-read-status').textContent=read?.message??'';
    $('circle-title').textContent=read?.conversation?.title??'A conversation worth having.';
    $('circle-refresh').disabled=!(m?.connected&&m.active&&m.online&&!read?.busy&&!write?.busy);
    $('circle-conversation').hidden=!read?.conversation;
    $('circle-messages').replaceChildren(...(read?.conversation?.messages.map(message=>{
      const article=doc.createElement('article');article.append(text('strong',message.member_name+(message.is_mine?' · You':'')),text('p',message.created_at),text('p',message.content));return article;
    })??[]));
    $('circle-draft').value=write?.draft??'';$('circle-draft').disabled=!write?.canEdit;
    $('circle-remaining').textContent=`${write?.remaining??2000} characters remaining`;
    $('circle-write-status').textContent=write?.message??'Refresh current membership before writing.';
    $('circle-post').disabled=!write?.canSend;$('circle-post').textContent=write?.busy?'Posting to circle…':'Post to circle';
    $('circle-clear').disabled=!write?.canEdit||!write?.draft;
    $('circle-new').hidden=!write?.canStartNew;
  };
  const off=host?.subscribe(render)??(()=>{});
  const handlers=[];
  const listen=(target,name,callback)=>{target.addEventListener(name,callback);handlers.push(()=>target.removeEventListener(name,callback));};
  listen($('circle-refresh'),'click',()=>void host?.refresh());
  listen($('circle-post'),'click',()=>void host?.post());
  listen($('circle-clear'),'click',()=>host?.clearDraft());
  listen($('circle-new'),'click',()=>host?.startNewAfterReview());
  listen($('circle-draft'),'input',()=>{host?.edit($('circle-draft').value);if(host)render(host.model());});
  listen($('circle-close'),'click',()=>{host?.close();$('circle-refresh').focus();});
  let focused=doc.hasFocus(),visible=doc.visibilityState==='visible',disposed=false;
  const activity=()=>host?.activity(visible&&focused);
  listen(win,'blur',()=>{focused=false;activity();});listen(win,'focus',()=>{focused=true;activity();});
  listen(doc,'visibilitychange',()=>{visible=doc.visibilityState==='visible';activity();});
  listen(win,'offline',()=>host?.connectivity(false));listen(win,'online',()=>host?.connectivity(true));
  const dispose=()=>{if(disposed)return;disposed=true;host?.disconnect();off();for(const remove of handlers)remove();};
  listen(win,'pagehide',dispose);
  host?.connect();activity();host?.connectivity(win.navigator.onLine!==false);
  if(host)void host.refresh();else render(null);
  return {host,dispose};
}
/** Standard browser fetch enforces redirect:error before forwarding a bearer.
 * This function is intentionally never selected by the React Native screen. */
export function browserCircleTransport(win) { return (url,init)=>win.fetch(url,{...init,mode:'cors',referrerPolicy:'no-referrer'}); }
