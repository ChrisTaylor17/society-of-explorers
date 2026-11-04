import React from 'react';
import { createRoot } from 'react-dom/client';
import LegacySalon from '../../../app/book-salons/[cohortId]/LegacySalon';
import { notifyAuthProviderChanged } from '../../../lib/auth/providerSelection';
import '../../../app/globals.css';

const subjects = { A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const qa = {
  selected: 'A' as 'A' | 'B', sdkCalls: 0, holdToken: false, tokenHeld: false,
  releaseToken: null as (() => void) | null,
  holdPostBody: false, bodyHeld: false, releasePostBody: null as (() => void) | null,
  change(account: 'A' | 'B') { qa.selected = account; notifyAuthProviderChanged(); },
  factory() { return { auth: {
    async getSession() {
      qa.sdkCalls++; const account = qa.selected;
      if (qa.holdToken) { qa.holdToken = false; qa.tokenHeld = true; await new Promise<void>(resolve => { qa.releaseToken = resolve; }); qa.tokenHeld = false; qa.releaseToken = null; }
      return { data: { session: { access_token: `NONISSUED_SALON_${account}`, user: { id: subjects[account] } } }, error: null };
    },
    async getUser(token?: string) {
      qa.sdkCalls++;
      return { data: { user: token === `NONISSUED_SALON_${qa.selected}` ? { id: subjects[qa.selected] } : null }, error: null };
    },
  } }; },
};
// A single explicit non-abortable local body double tests retirement after headers, before JSON.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await nativeFetch(input, init);
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!qa.holdPostBody || !url.pathname.startsWith('/api/book-salons/') || init?.method !== 'POST') return response;
  qa.holdPostBody = false;
  const bytes = await response.arrayBuffer(); qa.bodyHeld = true;
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    qa.releasePostBody = () => { controller.enqueue(new Uint8Array(bytes)); controller.close(); qa.bodyHeld = false; qa.releasePostBody = null; };
  } });
  return new Response(body, { status: response.status, headers: response.headers });
};
Object.assign(window, { salonQa: qa });
createRoot(document.getElementById('root')!).render(<React.StrictMode><LegacySalon /></React.StrictMode>);
