import 'server-only';
import { stringFromBase64URL } from '@supabase/ssr';
import { hasLocalSessionClaim } from './sessionClaims';

function sessionCookie(header: string, key: string): string | null {
  const chunks = new Map<string, string>();
  for (const entry of header.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 1) continue;
    const name = entry.slice(0, separator).trim();
    if (name !== key && !name.startsWith(key + '.')) continue;
    if (chunks.has(name)) return null;
    chunks.set(name, decodeURIComponent(entry.slice(separator + 1).trim()));
  }
  const whole = chunks.get(key);
  if (whole !== undefined) return chunks.size === 1 ? whole : null;
  let joined = '';
  for (let index = 0; index < chunks.size; index++) {
    const chunk = chunks.get(`${key}.${index}`);
    if (!chunk) return null;
    joined += chunk;
  }
  return joined || null;
}

/** Use the request's cookie bytes. Loading a live SDK session here can refresh
 * credentials or sign out a newer browser session after an async wait. */
export async function revokeSupabaseBrowserSession(cookies: string, subject: string): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  try {
    const provider = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (provider.protocol !== 'https:' || provider.username || provider.password ||
        provider.pathname !== '/' || provider.search || provider.hash ||
        !/^[A-Za-z0-9._-]{1,2048}$/.test(publicKey)) return false;
    const cookie = sessionCookie(cookies, `sb-${provider.hostname.split('.')[0]}-auth-token`);
    if (!cookie) return false;
    const session = JSON.parse(cookie.startsWith('base64-') ? stringFromBase64URL(cookie.slice(7)) : cookie);
    const token = session?.access_token;
    // GoTrue treats a missing session_id as a different sign-out case.
    if (typeof token !== 'string' || !hasLocalSessionClaim(token, subject)) return false;
    const endpoint = provider.origin + '/auth/v1/logout?scope=local';
    const response = await Promise.race([
      fetch(endpoint, { method: 'POST', headers: { apikey: publicKey, Authorization: `Bearer ${token}` },
        credentials: 'omit', redirect: 'error', cache: 'no-store', signal: abort.signal }),
      new Promise<null>(resolve => { timeout = setTimeout(() => { abort.abort(); resolve(null); }, 3_000); }),
    ]);
    return response?.status === 204 && !response.redirected;
  } catch { return false; }
  finally { if (timeout) clearTimeout(timeout); }
}
