/** Keyboard/focus behavior only. The controller owns confirmation and authorization. */
export function bindParticipationDialog({dialog,cancelButton,confirmButton,onCancel,onUnsupported=()=>{},fallbackFocus=()=>null}){
  let opener=null,actor=null,disposed=false;
  function key(event){
    if(!dialog.open)return;
    if(event.key==='Escape'){event.preventDefault();onCancel();return;}
    if(event.key!=='Tab')return;
    const controls=[cancelButton,confirmButton].filter(b=>!b.disabled&&!b.hidden),first=controls[0],last=controls.at(-1);
    if(!first){event.preventDefault();return;}
    const active=dialog.ownerDocument?.activeElement;
    if(event.shiftKey&&(active===first||!controls.includes(active))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(active===last||!controls.includes(active))){event.preventDefault();first.focus();}
  }
  const cancel=event=>{event.preventDefault();onCancel();};
  dialog.addEventListener('keydown',key);dialog.addEventListener('cancel',cancel);
  return {remember(element){opener=element;},sync(m){
    if(disposed)return;
    if(m.confirmation&&!dialog.open){if(typeof dialog.showModal!=='function'){onCancel();onUnsupported();return false;}actor=m.actor;dialog.showModal();cancelButton.focus();}
    else if(!m.confirmation&&dialog.open){dialog.close();if(m.active&&m.actor===actor){const target=opener?.isConnected!==false&&!opener?.disabled?opener:fallbackFocus();target?.focus();}actor=null;}
    return true;
  },dispose(){disposed=true;dialog.removeEventListener('keydown',key);dialog.removeEventListener('cancel',cancel);if(dialog.open)dialog.close();opener=null;actor=null;}};
}
