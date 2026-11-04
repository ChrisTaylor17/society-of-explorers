import {createMemberContributions,MESSAGE_REPORT_OPTIONS,MESSAGE_WITHDRAWAL_PRIVACY} from './circle-host.mjs';

const controls=['member-contributions-open','member-contributions','member-contributions-heading','member-contributions-status','member-contributions-list','member-contributions-refresh','member-contributions-items','member-contributions-next','member-contributions-selected','member-contributions-selected-heading','member-contributions-action-status','member-contributions-message','member-contributions-explanations','member-contributions-privacy','member-contributions-confirm-label','member-contributions-confirm','member-contributions-withdraw','member-contributions-check','member-contributions-retry','member-contributions-back','member-contributions-return','member-circle-workspace'];
/** Older configured pages may omit this complete island. Partial or duplicate
 * controls must fail before an account client can be observed. */
export function assertContributionsMarkup(doc) {
  const count=controls.filter(id=>doc.getElementById(id)).length;
  if(count&&count!==controls.length)throw Error('Contribution controls unavailable');
  if(typeof doc.querySelectorAll==='function'&&controls.some(id=>doc.querySelectorAll(`[id="${id}"]`).length>1))throw Error('Duplicate contribution controls unavailable');
  return count===controls.length;
}
export function mountMemberContributions({window:win,document:doc,config,circleHost}) {
  if(!assertContributionsMarkup(doc))return {dispose(){}};
  const $=id=>doc.getElementById(id),view=createMemberContributions(config);
  let opened=!circleHost,disposed=false,focused=doc.hasFocus(),visible=doc.visibilityState==='visible',selected=null;
  let model=view.model(),circle=circleHost?.model();
  const handlers=[];let off=()=>{},offCircle=()=>{};
  const text=(tag,value)=>{const e=doc.createElement(tag);e.textContent=value;return e;};
  const canLeaveCircle=()=>circle?.threadWrite?.canNavigate!==false&&circle?.messageSafety?.canNavigate!==false&&!circle?.participation?.write.busy;
  function render() {
    if(disposed)return;
    $('member-contributions-open').hidden=opened;
    $('member-contributions-open').disabled=!model.connected||!model.active||!model.online||!canLeaveCircle();
    $('member-contributions').hidden=!opened;$('member-circle-workspace').hidden=opened;
    $('member-contributions').setAttribute('aria-busy',String(model.busy||Boolean(model.safety?.busy)));
    $('member-contributions-status').textContent=model.message;
    $('member-contributions-list').hidden=Boolean(model.selected);
    $('member-contributions-refresh').disabled=!model.canRefresh;
    $('member-contributions-next').hidden=!model.nextCursor;$('member-contributions-next').disabled=!model.canNext;
    $('member-contributions-items').replaceChildren(...model.items.map(item=>{
      const article=doc.createElement('article');article.dataset.contributionId=item.message.id;article.dataset.circleId=item.circleId;
      article.append(text('strong','Your contribution'),text('p',item.message.created_at),text('p',item.message.content??(item.message.visibility==='withdrawn'?'This contribution was withdrawn.':'This contribution is restricted by moderation.')));
      const button=text('button','Check my contribution');button.type='button';button.disabled=!model.canSelect;
      button.addEventListener('click',()=>void view.select(item.circleId,item.message.id));article.append(button);return article;
    }));
    const safety=model.safety,state=safety?.state;
    $('member-contributions-selected').hidden=!model.selected;
    $('member-contributions-action-status').textContent=safety?.message??'';
    const message=[];
    if(state){const article=doc.createElement('article');article.append(text('strong','Your contribution'),text('p',state.message.created_at),text('p',state.message.content??(state.message.visibility==='withdrawn'?'This contribution was withdrawn.':'This contribution is restricted by moderation.')));message.push(article);}
    $('member-contributions-message').replaceChildren(...message);
    $('member-contributions-explanations').replaceChildren(...(state?.explanations.map(explanation=>{
      const label=MESSAGE_REPORT_OPTIONS.find(option=>option.value===explanation.reason)?.label??({no_violation:'No violation found',insufficient_evidence:'Insufficient evidence',resolved:'Concern resolved'}[explanation.reason]??explanation.reason);
      const article=doc.createElement('article');article.append(text('strong',(explanation.action==='hide'?'Hidden':'Moderator restriction lifted')+' · '+label),text('p',explanation.summary),text('p',explanation.created_at));return article;
    })??[]));
    $('member-contributions-privacy').textContent=MESSAGE_WITHDRAWAL_PRIVACY;
    $('member-contributions-confirm-label').hidden=!state?.canWithdraw;
    $('member-contributions-confirm').checked=Boolean(safety?.confirmed);$('member-contributions-confirm').disabled=!safety?.canConfirm;
    $('member-contributions-withdraw').hidden=!state?.canWithdraw;$('member-contributions-withdraw').disabled=!safety?.canWithdraw;
    $('member-contributions-check').disabled=!safety?.canCheck;
    $('member-contributions-retry').hidden=!safety?.canRetry;$('member-contributions-retry').disabled=!safety?.canRetry;
    $('member-contributions-back').disabled=!model.canBack;$('member-contributions-return').disabled=!model.canNavigate;$('member-contributions-return').hidden=!circleHost;
    const pair=model.selected?`${model.selected.circleId}:${model.selected.messageId}`:null;
    if(opened&&pair&&pair!==selected)$('member-contributions-selected-heading').focus();selected=pair;
  }
  function activity() {
    view.activity(visible&&focused);
    circleHost?.activity(!opened&&visible&&focused);
  }
  const dispose=()=>{
    if(disposed)return;disposed=true;
    for(const stop of [()=>view.disconnect(),()=>off(),()=>offCircle(),...handlers]){try{stop();}catch{/* Finish every independent retirement. */}}
    handlers.length=0;
    for(const id of ['member-contributions-items','member-contributions-message','member-contributions-explanations'])try{$(id)?.replaceChildren();}catch{}
    for(const id of ['member-contributions-status','member-contributions-action-status'])if($(id))$(id).textContent='';
    if($('member-contributions-confirm'))$('member-contributions-confirm').checked=false;
    if($('member-contributions'))$('member-contributions').hidden=true;
    if($('member-contributions-open')){$('member-contributions-open').hidden=false;$('member-contributions-open').disabled=true;}
    if($('member-circle-workspace'))$('member-circle-workspace').hidden=false;
  };
  try {
    off=view.subscribe(value=>{model=value;render();});
    offCircle=circleHost?.subscribe(value=>{circle=value;render();})??(()=>{});
    const listen=(target,event,callback)=>{target.addEventListener(event,callback);handlers.push(()=>target.removeEventListener(event,callback));};
    listen($('member-contributions-open'),'click',()=>{
      if(disposed||opened||!model.connected||!model.active||!model.online||!canLeaveCircle())return;
      opened=true;circleHost?.close();activity();render();$('member-contributions-heading').focus();
    });
    listen($('member-contributions-refresh'),'click',()=>{if(opened)void view.refresh();});
    listen($('member-contributions-next'),'click',()=>{if(opened)void view.next();});
    listen($('member-contributions-confirm'),'change',()=>view.confirm($('member-contributions-confirm').checked));
    listen($('member-contributions-withdraw'),'click',()=>void view.withdraw());
    listen($('member-contributions-check'),'click',()=>void view.check());
    listen($('member-contributions-retry'),'click',()=>void view.retry());
    listen($('member-contributions-back'),'click',()=>{if(!model.canBack)return;view.back();$('member-contributions-refresh').focus();});
    listen($('member-contributions-return'),'click',()=>{
      if(!model.canNavigate)return;view.close();opened=false;activity();render();$('circle-refresh').focus();
    });
    listen(win,'blur',()=>{focused=false;activity();});listen(win,'focus',()=>{focused=true;activity();});
    listen(doc,'visibilitychange',()=>{visible=doc.visibilityState==='visible';activity();});
    listen(win,'offline',()=>view.connectivity(false));listen(win,'online',()=>view.connectivity(true));
    listen(win,'pagehide',dispose);view.connect();activity();view.connectivity(win.navigator.onLine!==false);render();
    return {view,dispose};
  }catch{dispose();throw Error('Member contributions could not be opened');}
}
