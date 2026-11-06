import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyAuthProviderChanged } from '@/lib/auth/providerSelection';
import { beginBrowserAuthIntent, isCurrentBrowserAuthIntent } from '@/lib/auth/browserIntent';

export type BrowserSignOutResult = { confirmed: false } |
  { confirmed: true; sdkCleanup: 'completed' | 'unconfirmed'; walletSessionRevoked: boolean };
const ownedKey = (key: string) => key === 'soe_wallet_id' || /^sb-[A-Za-z0-9_-]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/.test(key)
  || key === 'sb-access-token' || key === 'sb-refresh-token';

export function clearBrowserAuthCaches() {
  if (typeof window === 'undefined') return;
  for (const storage of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const store = storage();
      for (let index = store.length - 1; index >= 0; index--) {
        const key = store.key(index);
        if (key && ownedKey(key)) store.removeItem(key);
      }
    } catch {}
  }
}

async function boundedJson(url: string, options: RequestInit) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...options, signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
        return { response, body: await response.json() };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Sign-out check timed out')); }, 8_000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function signOutBrowser(client: () => Pick<SupabaseClient, 'auth'>, requestId: string): Promise<BrowserSignOutResult> {
  // Rotate before dispatch. A delayed login response may overwrite server
  // cookies, but its receipt can no longer match this browser's intent.
  let intent: string;
  try { intent = beginBrowserAuthIntent(); } catch { return { confirmed: false }; }
  notifyAuthProviderChanged();
  if (!isCurrentBrowserAuthIntent(intent)) return { confirmed: false };
  clearBrowserAuthCaches();
  try {
    const { response, body: receipt } = await boundedJson('/api/auth/logout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'browser', requestId }),
    });
    if (!isCurrentBrowserAuthIntent(intent) || !response.ok || receipt?.outcome !== 'signed_out' ||
        receipt.scope !== 'browser' || receipt.requestId !== requestId ||
        !['not_confirmed', 'wallet_session_revoked'].includes(receipt.remoteRevocation)) return { confirmed: false };
    const { response: check, body: state } = await boundedJson('/api/auth/member', {});
    if (!isCurrentBrowserAuthIntent(intent) || check.status !== 401 || state?.session !== 'signed_out' ||
        state.browserSignedOut !== true || state.walletSignOutPending === true) return { confirmed: false };
    notifyAuthProviderChanged();
    if (!isCurrentBrowserAuthIntent(intent)) return { confirmed: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cleaned = false;
    try {
      cleaned = await Promise.race([
        client().auth.signOut({ scope: 'local' }).then(result => !result.error).catch(() => false),
        new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 3_000); }),
      ]);
    } catch { cleaned = false; }
    finally { if (timer) clearTimeout(timer); if (isCurrentBrowserAuthIntent(intent)) clearBrowserAuthCaches(); }
    if (!isCurrentBrowserAuthIntent(intent)) return { confirmed: false };
    return { confirmed: true, sdkCleanup: cleaned ? 'completed' : 'unconfirmed',
      walletSessionRevoked: receipt.remoteRevocation === 'wallet_session_revoked' };
  } catch { return { confirmed: false }; }
}
