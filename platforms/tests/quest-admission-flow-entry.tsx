import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestCircle from '../../app/quest/[circleId]/QuestCircle';
import { notifyAuthProviderChanged } from '../../lib/auth/providerSelection';
import { installQuestXrDouble } from './quest-xr-browser-double.mjs';
installQuestXrDouble();
let root = createRoot(document.getElementById('root')!), actor = '', calls = 0;
const listeners = new Set<(event: string, session: null) => void>();
const auth = {
  async getSession() { calls++; return { data: { session: { access_token: 'NONISSUED_QUEST_' + actor, user: { id: actor } } } }; },
  async getUser(token?: string) { calls++; if (token && token !== 'NONISSUED_QUEST_' + actor) throw Error('Unexpected synthetic actor'); return { data: { user: { id: actor } } }; },
  onAuthStateChange(listener: (event: string, session: null) => void) { listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } }; },
};
const qa = {
  client: () => ({ auth }), providerCalls: () => calls, subscriptions: () => listeners.size,
  providerChanged: notifyAuthProviderChanged,
  show(value: { memberId: string; circleId: string }) {
    root.unmount(); root = createRoot(document.getElementById('root')!); actor = value.memberId;
    root.render(<React.StrictMode><QuestCircle circleId={value.circleId}/></React.StrictMode>);
  },
  close() { root.unmount(); },
};
(window as unknown as { questAdmissionQa: typeof qa }).questAdmissionQa = qa;
