import React from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from '../../../app/dashboard/page';

const subject = '11111111-1111-4111-8111-111111111111';
let cleanupCalls = 0;
const qa = {
  cleanupCalls: () => cleanupCalls,
  factory() {
    return { auth: {
      async getSession() { return { data: { session: { access_token: 'NONISSUED_SIGNOUT_FIXTURE', user: { id: subject } } } }; },
      async getUser(token?: string) {
        if (token && token !== 'NONISSUED_SIGNOUT_FIXTURE') throw Error('Unexpected fixture token');
        return { data: { user: { id: subject } } };
      },
      async signOut(options: { scope: string }) {
        if (options.scope !== 'local') throw Error('Unexpected sign-out scope');
        cleanupCalls++;
        return { error: null };
      },
    } };
  },
  router: { push() {}, replace() {} },
};
Object.assign(window, { signoutQa: qa });
localStorage.setItem('soe_wallet_id', 'SYNTHETIC_WALLET_HINT');
localStorage.setItem('sb-fixture-auth-token', 'NONISSUED_CACHED_FIXTURE');
localStorage.setItem('unrelated-draft', 'PRESERVE_ME');
sessionStorage.setItem('sb-access-token', 'NONISSUED_CACHED_FIXTURE');
sessionStorage.setItem('unrelated-session', 'PRESERVE_ME');
createRoot(document.getElementById('root')!).render(<React.StrictMode><Dashboard /></React.StrictMode>);
