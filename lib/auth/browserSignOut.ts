import { notifyAuthProviderChanged } from '@/lib/auth/providerSelection';
import { AUTH_INTENT_HEADER, beginBrowserAuthIntent, currentBrowserAuthIntent, isCurrentBrowserAuthIntent } from '@/lib/auth/browserIntent';

export type BrowserSignOutResult = { confirmed: false } |
  { confirmed: true; providerSession: 'revoked' | 'unconfirmed' | 'not_applicable'; walletSessionRevoked: boolean };
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
        const response = await fetch(url, { ...options, signal: controller.signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
        return { response, body: await response.json() };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Sign-out check timed out')); }, 8_000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function signOutBrowser(requestId: string): Promise<BrowserSignOutResult> {
  // Rotate before dispatch. A delayed login response may overwrite server
  // cookies, but its receipt can no longer match this browser's intent.
  const previousIntent = currentBrowserAuthIntent();
  let intent: string;
  try { intent = beginBrowserAuthIntent(); } catch { return { confirmed: false }; }
  notifyAuthProviderChanged();
  if (!isCurrentBrowserAuthIntent(intent)) return { confirmed: false };
  clearBrowserAuthCaches();
  const headers = { 'Content-Type': 'application/json', [AUTH_INTENT_HEADER]: intent };
  let providerSession: 'revoked' | 'unconfirmed' | 'not_applicable' = 'not_applicable';
  if (previousIntent) {
    // The provider request changes no browser cookies. A newer account choice
    // can retire this action before it starts cookie cleanup.
    providerSession = 'unconfirmed';
    try {
      const { response, body } = await boundedJson('/api/auth/logout/provider', {
        method: 'POST', headers, body: JSON.stringify({ previousIntent, requestId }),
      });
      if (response.ok && body?.requestId === requestId && (body.state === 'revoked' || body.state === 'not_applicable')) {
        providerSession = body.state;
      }
    } catch { /* Local sign-out still proceeds if this account choice owns it. */ }
    if (!isCurrentBrowserAuthIntent(intent)) return { confirmed: false };
  }
  try {
    const { response, body: receipt } = await boundedJson('/api/auth/logout', {
      method: 'POST', headers, body: JSON.stringify({ scope: 'browser', requestId }),
    });
    if (!isCurrentBrowserAuthIntent(intent) || !response.ok || receipt?.outcome !== 'signed_out' ||
        receipt.scope !== 'browser' || receipt.requestId !== requestId ||
        !['not_confirmed', 'wallet_session_revoked'].includes(receipt.remoteRevocation)) return { confirmed: false };
    const { response: check, body: state } = await boundedJson('/api/auth/member', {});
    if (!isCurrentBrowserAuthIntent(intent) || check.status !== 401 || state?.session !== 'signed_out' ||
        state.browserSignedOut !== true || state.walletSignOutPending === true) return { confirmed: false };
    notifyAuthProviderChanged();
    if (!isCurrentBrowserAuthIntent(intent)) return { confirmed: false };
    clearBrowserAuthCaches();
    return { confirmed: true, providerSession,
      walletSessionRevoked: receipt.remoteRevocation === 'wallet_session_revoked' };
  } catch { return { confirmed: false }; }
}
