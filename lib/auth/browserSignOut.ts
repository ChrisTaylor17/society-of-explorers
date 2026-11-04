import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyAuthProviderChanged } from '@/lib/auth/providerSelection';

export type BrowserSignOutResult = { confirmed: false } | { confirmed: true; sdkCleanup: 'completed' | 'unconfirmed' };
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
  notifyAuthProviderChanged();
  clearBrowserAuthCaches();
  try {
    const { response, body: receipt } = await boundedJson('/api/auth/logout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'browser', requestId }),
    });
    if (!response.ok || receipt?.outcome !== 'signed_out' || receipt.scope !== 'browser' || receipt.requestId !== requestId) return { confirmed: false };
    const { response: check, body: state } = await boundedJson('/api/auth/member', {});
    if (check.status !== 401 || state?.session !== 'signed_out' || state.browserSignedOut !== true) return { confirmed: false };
    notifyAuthProviderChanged();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cleaned = false;
    try {
      cleaned = await Promise.race([
        client().auth.signOut({ scope: 'local' }).then(result => !result.error).catch(() => false),
        new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 3_000); }),
      ]);
    } catch { cleaned = false; }
    finally { if (timer) clearTimeout(timer); clearBrowserAuthCaches(); }
    return { confirmed: true, sdkCleanup: cleaned ? 'completed' : 'unconfirmed' };
  } catch { return { confirmed: false }; }
}
