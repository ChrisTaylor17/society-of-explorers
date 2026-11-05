// This browser-owned nonce is a choice of sign-in attempt, never a credential.
// Responses must not write it: delayed Set-Cookie may deny access, but cannot
// move the browser's current choice back to an older identity.
export const AUTH_INTENT_COOKIE = 'soe_auth_intent';
export const AUTH_SELECTION_COOKIE = 'soe_auth_selection_v1';
export const AUTH_PKCE_INTENT_COOKIE = 'soe_auth_pkce_intent';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseBrowserIntent(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

export function currentBrowserAuthIntent(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const values = document.cookie.split(';').map(part => part.trim()).filter(part => part.startsWith(AUTH_INTENT_COOKIE + '='));
    return values.length === 1 ? parseBrowserIntent(values[0].slice(AUTH_INTENT_COOKIE.length + 1)) : null;
  } catch { return null; }
}

export function isCurrentBrowserAuthIntent(intent: string): boolean {
  return parseBrowserIntent(intent) !== null && currentBrowserAuthIntent() === intent;
}

export function beginBrowserAuthIntent(): string {
  if (typeof window === 'undefined' || !window.isSecureContext || typeof window.crypto?.randomUUID !== 'function') {
    throw new Error('Sign-in is unavailable in this browser.');
  }
  const intent = window.crypto.randomUUID();
  if (!parseBrowserIntent(intent)) throw new Error('Sign-in is unavailable in this browser.');
  document.cookie = `${AUTH_INTENT_COOKIE}=${intent}; Path=/; Max-Age=2592000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
  if (!isCurrentBrowserAuthIntent(intent)) throw new Error('Sign-in cookies are unavailable.');
  return intent;
}

export function retireBrowserAuthIntent(expectedIntent: string): string | null {
  // A retired component must never invalidate a newer component's choice.
  if (!isCurrentBrowserAuthIntent(expectedIntent)) return null;
  return beginBrowserAuthIntent();
}

export type BrowserSelection = { intent: string; provider: 'supabase' | 'wallet'; subject: string };
export function parseBrowserSelection(value: unknown): BrowserSelection | null {
  if (typeof value !== 'string' || value.length > 100) return null;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || !parseBrowserIntent(parts[1]) ||
      (parts[2] !== 'supabase' && parts[2] !== 'wallet') || !parseBrowserIntent(parts[3])) return null;
  return { intent: parts[1], provider: parts[2], subject: parts[3] };
}

export function browserSelectionMatches(intent: unknown, receipt: unknown, provider: 'supabase' | 'wallet', subject: string): boolean {
  const current = parseBrowserIntent(intent), selected = parseBrowserSelection(receipt);
  return !!current && !!selected && selected.intent === current && selected.provider === provider && selected.subject === subject.toLowerCase();
}
