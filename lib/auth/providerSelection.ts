import type { SupabaseClient } from '@supabase/supabase-js';

// Called only after a deliberate successful provider sign-in. A saved wallet
// remains a separate credential; it cannot override the newly selected user.
export async function confirmSupabaseProvider(client: Pick<SupabaseClient, 'auth'>): Promise<boolean> {
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return false;
    const response = await fetch('/api/auth/provider', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'supabase', expectedSubject: user.id }),
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    const confirmed = !!result && typeof result === 'object' &&
      (result as { selected?: unknown }).selected === 'supabase' &&
      (result as { subject?: unknown }).subject === user.id;
    if (confirmed) notifyAuthProviderChanged();
    return confirmed;
  } catch { return false; }
}

export const AUTH_PROVIDER_CHANGED_EVENT = 'soe:auth-provider-changed';
export const AUTH_PROVIDER_CHANGE_STORAGE_KEY = 'soe.auth.provider.changed';
const PROVIDER_CHANNEL = 'soe:auth-provider';

// Notification is retirement intent, never an authentication claim. No account
// ID or credential is retained or broadcast; blocked storage still permits the
// same-tab event, and blocked BroadcastChannel still permits storage events.
export function notifyAuthProviderChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_PROVIDER_CHANGED_EVENT));
  try { window.localStorage.setItem(AUTH_PROVIDER_CHANGE_STORAGE_KEY, `${Date.now()}:${Math.random()}`); } catch {}
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(PROVIDER_CHANNEL);
      channel.postMessage('changed');
      channel.close();
    }
  } catch {}
}

export function subscribeAuthProviderChanges(retire: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const storage = (event: StorageEvent) => { if (event.key === AUTH_PROVIDER_CHANGE_STORAGE_KEY) retire(); };
  window.addEventListener(AUTH_PROVIDER_CHANGED_EVENT, retire);
  window.addEventListener('storage', storage);
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(PROVIDER_CHANNEL);
      channel.onmessage = event => { if (event.data === 'changed') retire(); };
    }
  } catch {}
  return () => {
    window.removeEventListener(AUTH_PROVIDER_CHANGED_EVENT, retire);
    window.removeEventListener('storage', storage);
    channel?.close();
  };
}
