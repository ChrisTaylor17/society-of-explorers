import React from 'react';
import { createRoot } from 'react-dom/client';
import { CircleAdmissionScreen } from '../native/CircleAdmissionScreen';
import { MemberCircleScreen, createMemberViewConnection } from '../native/MemberCircleScreen';
import { createCircleAdmission } from '../shared/circle-admission';
import { createNativeMemberPorts } from '../native/src/circles/native-ports';

let root = createRoot(document.getElementById('root')!), session: ReturnType<typeof createCircleAdmission> | null = null;
let rootSession: ReturnType<typeof createMemberViewConnection> | null = null, state = 'active', platform = 'ios', count = 0, retainedId = 0;
const sessions = new Map<string, ReturnType<typeof createCircleAdmission>>();
const roots = new Map<string, { connection: ReturnType<typeof createMemberViewConnection>; config: Parameters<typeof createMemberViewConnection>[0]; connectivity: { snapshot(): 'online'; subscribe(): () => void } }>();
const listeners = new Map<string, Set<(value: string) => void>>(), callbacks = new Map<string, () => void>(), retained = new Map<number, () => void>();
async function portsFor(memberId: string) {
  const origin = location.origin, storageKey = 'admission-flow-' + (++count), generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const bridge = {
    capabilities: async () => ({ version: 2, origin, storageKey, storageGeneration: generation, redirectPolicy: 'reject-before-send', storagePolicy: 'os-protected', circleAdmissionPolicy: 'member-bound-circle-admission-v1' }),
    begin: async () => crypto.randomUUID(), cancel: async () => {}, read: async () => null, write: async () => {}, remove: async () => {},
    resetAccountStorage: async () => ({ previousGeneration: generation, generation, cleared: true }),
    async send(_id: string, input: { url: string; method: 'GET' | 'POST'; bearer: string; body?: string }) {
      const r = await fetch(input.url, { method: input.method, headers: { Authorization: 'Bearer ' + input.bearer, ...(input.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        ...(input.body ? { body: input.body } : {}), credentials: 'omit', redirect: 'error', cache: 'no-store' });
      return { status: r.status, url: r.url, redirected: r.redirected, body: await r.text() };
    },
  };
  const ports = await createNativeMemberPorts(bridge, { origin, storageKey });
  const token = 'NONISSUED_NATIVE_' + memberId;
  const auth = {
    async getSession() { return { data: { session: { access_token: token, user: { id: memberId } } } }; },
    async getUser(value: string) { if (value !== token) throw Error('Unexpected synthetic identity'); return { data: { user: { id: memberId } } }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
  };
  return { origin, ports, auth, token };
}
const qa = {
  get state() { return state; }, get platform() { return platform; },
  listen(name: string, fn: (value: string) => void) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); return { remove: () => listeners.get(name)!.delete(fn) }; },
  capture(label: string, fn: () => void) { if (label) callbacks.set(label, fn); },
  retain(label: string) { const fn = callbacks.get(label); if (!fn) throw Error('Missing callback'); const id = ++retainedId; retained.set(id, fn); return id; },
  invoke(id: number) { retained.get(id)?.(); },
  activity(value: string, event = 'change') { state = value; for (const fn of listeners.get(event) ?? []) fn(value); },
  model: () => rootSession?.admission()?.session.model() ?? session?.model(),
  accountModel: () => rootSession?.account.model(),
  async show(value: { circleId: string; memberId: string; platform: 'ios' | 'android'; mode?: 'direct' | 'root' }) {
    root.unmount(); root = createRoot(document.getElementById('root')!); callbacks.clear(); state = 'active'; platform = value.platform; rootSession = null; session = null;
    const key = value.memberId + ':' + value.circleId;
    if (value.mode !== 'direct') {
      if (!roots.has(key)) {
        const { origin, ports, auth } = await portsFor(value.memberId), connectivity = { snapshot: () => 'online' as const, subscribe: () => () => {} };
        const config = { origin, auth, transport: ports.transport, admissionTransport: ports.admissionTransport, newRequestId: async () => crypto.randomUUID(), timeoutMs: 2000 };
        roots.set(key, { config, connectivity, connection: createMemberViewConnection(config, connectivity) });
      }
      const record = roots.get(key)!; rootSession = record.connection;
      root.render(<React.StrictMode><MemberCircleScreen config={record.config} retained={record.connection} connectivity={record.connectivity}
        circleChoice={{ id: value.circleId, title: 'Synthetic selected salon' }} onClose={() => {}}/></React.StrictMode>); return;
    }
    if (!sessions.has(key) || sessions.get(key)!.model().closed) {
      const { origin, ports, token } = await portsFor(value.memberId);
      const owner = { scope: () => state === 'active' ? key : null, credentials: async () => state === 'active' ? { bearer: token, subject: value.memberId } : null, subscribe: () => () => {} };
      sessions.set(key, createCircleAdmission({ origin, circleId: value.circleId, memberId: value.memberId, owner,
        transport: ports.transport, admissionTransport: ports.admissionTransport!, newRequestId: async () => crypto.randomUUID(), timeoutMs: 1500 }));
    }
    session = sessions.get(key)!;
    const connectivity = { snapshot: () => 'online' as const, subscribe: () => () => {} };
    root.render(<React.StrictMode><CircleAdmissionScreen session={session} connectivity={connectivity} onBack={() => {}} onDiscard={() => {}}/></React.StrictMode>);
  },
  close() { root.unmount(); for (const value of sessions.values()) value.close(); for (const value of roots.values()) value.connection.close(); sessions.clear(); roots.clear(); session = null; rootSession = null; },
};
(window as unknown as { nativeAdmissionQa: typeof qa }).nativeAdmissionQa = qa;
