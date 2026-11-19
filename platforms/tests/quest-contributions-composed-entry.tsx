import React from 'react';
import { createRoot } from 'react-dom/client';
import { assertContributionsMarkup } from '../quest/member-contributions-view.mjs';
import QuestCircle from '../../app/quest/[circleId]/QuestCircle';
import { notifyAuthProviderChanged } from '../../lib/auth/providerSelection';

const subjects = { other: '73222222-2222-4222-8222-222222222222', author: '73111111-1111-4111-8111-111111111111', outsider: '73333333-3333-4333-8333-333333333333' };
const tokens = { other: 'NONISSUED_CONTRIBUTIONS_OTHER', author: 'NONISSUED_CONTRIBUTIONS_AUTHOR', outsider: 'NONISSUED_CONTRIBUTIONS_OUTSIDER' };
let actor: keyof typeof subjects = 'author', factories = 0, calls = 0;
const listeners = new Set<(event: string, session: null) => void>();
const auth = {
  async getSession() { calls++; return { data: { session: { access_token: tokens[actor], user: { id: subjects[actor] } } } }; },
  async getUser(jwt: string) { calls++; if (jwt !== tokens[actor]) throw Error('Synthetic exact-token mismatch'); return { data: { user: { id: subjects[actor] } } }; },
  onAuthStateChange(listener: (event: string, session: null) => void) { listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } }; },
};
const root = createRoot(document.getElementById('root')!);
const qa = { markupContract() {
    const complete=assertContributionsMarkup(document);
    const legacy=!assertContributionsMarkup({getElementById:()=>null});
    let partial=false;try{assertContributionsMarkup({getElementById:(id:string)=>id==='member-contributions-check'?null:document.getElementById(id)});}catch{partial=true;}
    const duplicate=document.createElement('div');duplicate.id='member-contributions-confirm';document.body.append(duplicate);
    let duplicates=false;try{assertContributionsMarkup(document);}catch{duplicates=true;}finally{duplicate.remove();}
    return{complete,legacy,partial,duplicates};
  }, factory() { factories++; return { auth }; }, counts: () => ({ factories, calls, subscriptions: listeners.size }),
  actor(value: keyof typeof subjects) { actor = value; }, providerChanged: notifyAuthProviderChanged,
  emit(event: string) { for (const listener of [...listeners]) listener(event, null); }, mode(circleId: string | null) { root.render(<React.StrictMode><QuestCircle key={circleId ?? 'own'} circleId={circleId ?? undefined} /></React.StrictMode>); }, unmount() { root.unmount(); } };
Object.assign(window, { questContributionsQa: qa });
root.render(<React.StrictMode><QuestCircle circleId={undefined} /></React.StrictMode>);
