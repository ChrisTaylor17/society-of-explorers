import { createQueueClient } from './queue-client.mjs';
import { renderQueueView } from './queue-view.mjs';
const client=createQueueClient({storage:sessionStorage});
const workspace=document.getElementById('workspace');
client.subscribe(s=>{workspace.innerHTML=renderQueueView(s);});
document.addEventListener('click',event=>{
  const button=event.target.closest('button'); if(!button || button.disabled)return;
  if(button.dataset.actor)client.connect(button.dataset.actor);
  else if(button.dataset.action)client.prepare(button.dataset.action,button.dataset.handoff ?? button.dataset.request);
  else ({refresh:()=>client.refresh(),signout:()=>client.signOut(),confirm:()=>client.confirm(),cancel:()=>client.cancelProposal(),lookup:()=>client.checkReceipt(),retry:()=>client.retry()})[button.id]?.();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')client.cancelProposal();});
window.addEventListener('offline',()=>client.noteOffline());
window.addEventListener('online',()=>client.refresh());
