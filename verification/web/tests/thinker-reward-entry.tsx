import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ThinkerRewardNotice, useThinkerRewards } from '../../../components/ThinkerRewardNotice';
import { AUTH_PROVIDER_CHANGED_EVENT } from '../../../lib/auth/providerSelection';

type Held = { kind: string; release(): void; signal?: AbortSignal };
type Call = { method: string; url: string; credentials?: RequestCredentials; cache?: RequestCache; redirect?: RequestRedirect; referrerPolicy?: ReferrerPolicy; signal?: AbortSignal };
const root = createRoot(document.getElementById('root')!);
let mount = 0;
const qa = {
  reward: null as ReturnType<typeof useThinkerRewards> | null,
  mounted: false,
  held: null as Held | null,
  holdNext: '' as '' | 'credentials' | 'headers' | 'body',
  calls: [] as Call[],
  credentialCalls: 0,
  async hold(kind: string, signal?: AbortSignal) {
    await new Promise<void>(resolve => { qa.held = { kind, signal, release() { qa.held = null; resolve(); } }; });
  },
  async credentials() {
    qa.credentialCalls++;
    if (qa.holdNext === 'credentials') { qa.holdNext = ''; await qa.hold('credentials'); }
    return {};
  },
  start(label = 'Socrates', amount: 4 | 8 = 8) { return qa.reward?.begin(label, amount) ?? null; },
  observe(id: string, value: unknown) { qa.reward?.observe(id, value); },
  finish(id: string) { qa.reward?.finish(id); },
  retire() { window.dispatchEvent(new Event(AUTH_PROVIDER_CHANGED_EVENT)); },
  release() { qa.held?.release(); },
  heldState() { return qa.held ? { kind: qa.held.kind, aborted: qa.held.signal?.aborted ?? null } : null; },
  stats() { return { credentialCalls: qa.credentialCalls, calls: qa.calls.map(({ signal, ...call }) => ({ ...call, aborted: signal?.aborted ?? null })) }; },
  show() { root.render(<React.StrictMode><Fixture key={++mount} /></React.StrictMode>); },
  unmount() { root.render(null); },
};
const fetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const signal = init?.signal ?? undefined;
  qa.calls.push({ url: String(input), method: init?.method ?? 'GET', credentials: init?.credentials, cache: init?.cache, redirect: init?.redirect, referrerPolicy: init?.referrerPolicy, signal });
  const response = await fetch(input, init);
  if (qa.holdNext === 'headers') { qa.holdNext = ''; await qa.hold('headers', signal); }
  if (qa.holdNext !== 'body') return response;
  qa.holdNext = '';
  const text = await response.text();
  const held = new Response(text, { status: response.status, headers: response.headers });
  // Explicit nonabortable JSON double: the real hook must retire its late result.
  Object.defineProperty(held, 'json', { value: async () => { await qa.hold('body', signal); return JSON.parse(text); } });
  return held;
};
function Fixture() {
  const reward = useThinkerRewards();
  useEffect(() => { qa.mounted = true; qa.reward = reward; return () => { qa.mounted = false; qa.reward = null; }; }, [reward]);
  return <main><h1>Actual Thinker reward notice fixture</h1><ThinkerRewardNotice reward={reward} /></main>;
}
Object.assign(window, { thinkerRewardQa: qa });
qa.show();
