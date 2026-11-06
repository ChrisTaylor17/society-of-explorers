import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemberCircleScreen } from '../native/MemberCircleScreen';
import { createNativeMemberPorts } from '../native/src/circles/native-ports';

type Platform = 'ios' | 'android';
const root = createRoot(document.getElementById('root')!);
const listeners = new Map<string, Set<(value: string) => void>>();
const appState = {
  currentState: 'active',
  addEventListener(name: string, fn: (value: string) => void) {
    let set = listeners.get(name);
    if (!set) { set = new Set(); listeners.set(name, set); }
    set.add(fn);
    return { remove() { set.delete(fn); } };
  },
};
const qa = {
  platform: 'ios' as Platform, appState,
  capture() {},
  activity(value: string) {
    appState.currentState = value;
    for (const listener of listeners.get('change') ?? []) listener(value);
  },
  async mount({ platform, origin, token, subject }: { platform: Platform; origin: string; token: string; subject: string }) {
    qa.platform = platform;
    const generation = crypto.randomUUID(), storageKey = 'synthetic-native-member-blocks';
    const ports = await createNativeMemberPorts({
      async capabilities() {
        return { version: 2, origin, storageKey, storageGeneration: generation, redirectPolicy: 'reject-before-send',
          storagePolicy: 'os-protected', requestIdPolicy: 'os-random-uuid', memberBlocksPolicy: 'owner-member-blocks-v1' };
      },
      async newRequestId() { return crypto.randomUUID(); },
      async begin() { return crypto.randomUUID(); },
      async send(_handle, input) {
        const response = await fetch(input.url, { method: input.method, credentials: 'omit', redirect: 'error', cache: 'no-store',
          headers: { Authorization: 'Bearer ' + input.bearer, ...(input.body ? { 'Content-Type': 'application/json' } : {}) },
          body: input.body });
        return { status: response.status, url: input.url, redirected: false, body: await response.text() };
      },
      async cancel() {}, async read() { return null; }, async write() {}, async remove() {},
      async resetAccountStorage() { throw Error('Unused synthetic reset'); },
    }, { origin, storageKey, timeoutMs: 3000 });
    const auth = {
      async getSession() { return { data: { session: { access_token: token, user: { id: subject } } }, error: null }; },
      async getUser(value: string) { return { data: { user: value === token ? { id: subject } : null }, error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    };
    root.render(<MemberCircleScreen config={{ origin, auth, transport: ports.transport,
      memberBlocksTransport: ports.memberBlocksTransport, newRequestId: ports.newRequestId }}
      connectivity={{ snapshot: () => 'online', subscribe: () => () => {} }}
      onClose={() => root.unmount()}/>);
  },
};
Object.assign(window, { nativeQa: qa });
