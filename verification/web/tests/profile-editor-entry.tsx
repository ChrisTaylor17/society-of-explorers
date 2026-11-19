import React from 'react';
import { createRoot } from 'react-dom/client';
import ProfilePage from '../../../app/account/profile/page';
import { notifyAuthProviderChanged } from '../../../lib/auth/providerSelection';
import '../../../app/globals.css';

// Explicit SDK double only. Product page/editor/parser/auth-selection helpers
// and CSS are bundled unchanged; no provider or issued credential is involved.
const subjects = { A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const qa = {
  selected: 'A' as 'A' | 'B',
  sdkCalls: 0,
  holdPostBody: false,
  bodyHeld: false,
  releasePostBody: null as (() => void) | null,
  change(account: 'A' | 'B') { qa.selected = account; notifyAuthProviderChanged(); },
  factory() {
    return { auth: {
      async getSession() {
        qa.sdkCalls++;
        return { data: { session: { access_token: `NONISSUED_PROFILE_${qa.selected}`, user: { id: subjects[qa.selected] } } }, error: null };
      },
      async getUser(token?: string) {
        qa.sdkCalls++;
        return { data: { user: token === `NONISSUED_PROFILE_${qa.selected}` ? { id: subjects[qa.selected] } : null }, error: null };
      },
    } };
  },
};
// One explicit non-abortable local body stream tests retirement AFTER headers
// arrive but BEFORE JSON parsing finishes. This is a test transport double.
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await nativeFetch(input, init);
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!qa.holdPostBody || url.pathname !== '/api/members/profile' || init?.method !== 'POST') return response;
  qa.holdPostBody = false;
  const bytes = await response.arrayBuffer();
  qa.bodyHeld = true;
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    qa.releasePostBody = () => { controller.enqueue(new Uint8Array(bytes)); controller.close(); qa.bodyHeld = false; qa.releasePostBody = null; };
  } });
  return new Response(body, { status: response.status, headers: response.headers });
};
Object.assign(window, { profileQa: qa });
createRoot(document.getElementById('root')!).render(<React.StrictMode><ProfilePage /></React.StrictMode>);
