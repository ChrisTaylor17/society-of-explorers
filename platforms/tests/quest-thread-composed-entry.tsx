import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestCircle from '../../app/quest/[circleId]/QuestCircle';
import { notifyAuthProviderChanged } from '../../lib/auth/providerSelection';

const subjects = { author: '72111111-1111-4111-8111-111111111111', outsider: '72222222-2222-4222-8222-222222222222' };
const tokens = { author: 'NONISSUED_THREAD_AUTHOR', outsider: 'NONISSUED_THREAD_OUTSIDER' };
let actor: keyof typeof subjects = 'author', factories = 0, calls = 0;
const listeners = new Set<(event: string, session: null) => void>();
const auth = {
  async getSession() { calls++; return { data: { session: { access_token: tokens[actor], user: { id: subjects[actor] } } } }; },
  async getUser(jwt: string) { calls++; if (jwt !== tokens[actor]) throw Error('Synthetic exact-token mismatch'); return { data: { user: { id: subjects[actor] } } }; },
  onAuthStateChange(listener: (event: string, session: null) => void) { listeners.add(listener); return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } }; },
};
const root = createRoot(document.getElementById('root')!);
const qa = { factory() { factories++; return { auth }; }, counts: () => ({ factories, calls, subscriptions: listeners.size }),
  actor(value: keyof typeof subjects) { actor = value; }, providerChanged: notifyAuthProviderChanged,
  emit(event: string) { for (const listener of [...listeners]) listener(event, null); }, unmount() { root.unmount(); } };
Object.assign(window, { questThreadQa: qa });
root.render(<React.StrictMode><QuestCircle circleId={document.documentElement.dataset.circle!} /></React.StrictMode>);
