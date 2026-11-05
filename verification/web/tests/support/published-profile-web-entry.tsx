import React from 'react';
import { createRoot } from 'react-dom/client';
import CircleDetail from '../../../../app/circles/[circleId]/CircleDetail';
import DiscussionBrowser from '../../../../app/circles/[circleId]/discussion/DiscussionBrowser';
import QuestCircle from '../../../../app/quest/[circleId]/QuestCircle';
import PublishedProfileLink from '../../../../components/PublishedProfileLink';

const listeners = new Set<(event: string) => void>();
let token = '', subject = '', active = true, online = true, generation = 0;
let root = createRoot(document.getElementById('root')!);
Object.defineProperty(navigator, 'onLine', { get: () => online, configurable: true });
Object.defineProperty(document, 'hasFocus', { value: () => active, configurable: true });
const auth = {
  getSession: async () => ({ data: { session: { access_token: token, user: { id: subject } } }, error: null }),
  getUser: async (jwt: string) => ({ data: { user: jwt === token ? { id: subject } : null }, error: null }),
  onAuthStateChange(listener: (event: string) => void) {
    listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
  },
};
const qa = {
  credentials: async () => token ? { Authorization: 'Bearer ' + token } : {},
  factory: () => ({ auth }),
  show(value: { screen: 'circle' | 'discussion' | 'quest' | 'link'; circleId: string; token: string; subject: string; messageId?: string; profileId?: string | null }) {
    token = value.token; subject = value.subject; active = true; online = true; generation++;
    root.render(<React.StrictMode><main key={generation} style={{ padding: 16, maxWidth: 800, margin: 'auto' }}>
      {value.screen === 'circle' ? <CircleDetail circleId={value.circleId} />
        : value.screen === 'discussion' ? <DiscussionBrowser circleId={value.circleId} messageId={value.messageId ?? null} />
          : value.screen === 'quest' ? <QuestCircle circleId={value.circleId} /> : <PublishedProfileLink profileId={value.profileId} />}
    </main></React.StrictMode>);
  },
  activity(value: boolean) { active = value; window.dispatchEvent(new Event(value ? 'focus' : 'blur')); },
  network(value: boolean) { online = value; window.dispatchEvent(new Event(value ? 'online' : 'offline')); },
  identity() { for (const listener of [...listeners]) listener('SIGNED_OUT'); },
  stats: () => ({ subscriptions: listeners.size }),
  unmount() { root.unmount(); root = createRoot(document.getElementById('root')!); },
};
Object.assign(window, { publishedProfileQa: qa });
