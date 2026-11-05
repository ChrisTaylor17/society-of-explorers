import { Buffer } from 'node:buffer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ordinaryMethods = new Set(['oauth']);

/** Purpose routing only. The caller must also verify this exact token with
 * the configured provider before releasing any cookie or selecting an account. */
export function ordinaryCallbackIdentity(data: unknown, now = Date.now()): { token: string; subject: string } | null {
  try {
    if (!data || typeof data !== 'object') return null;
    const result = data as { redirectType?: unknown; session?: unknown; user?: unknown };
    if (result.redirectType !== null && result.redirectType !== undefined) return null;
    if (!result.session || typeof result.session !== 'object' || !result.user || typeof result.user !== 'object') return null;
    const session = result.session as { access_token?: unknown; expires_at?: unknown; user?: { id?: unknown }; token_type?: unknown };
    const subject = (result.user as { id?: unknown }).id;
    const token = session.access_token;
    if (typeof subject !== 'string' || !UUID.test(subject) || session.user?.id !== subject ||
        typeof token !== 'string' || token.length > 16384 || session.token_type !== 'bearer' ||
        typeof session.expires_at !== 'number' || !Number.isSafeInteger(session.expires_at) || session.expires_at <= now / 1000 + 30) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    if (claims.sub !== subject || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) ||
        claims.exp <= now / 1000 + 30 || !Array.isArray(claims.amr) || !claims.amr.length || claims.amr.length > 8) return null;
    // Recovery has its own method, even if a browser-controlled verifier suffix
    // was stripped. Missing or unfamiliar methods require ordinary sign-in.
    if (!claims.amr.every(entry => entry && typeof entry === 'object' && ordinaryMethods.has(entry.method) &&
      Number.isSafeInteger(entry.timestamp) && entry.timestamp > 0 && entry.timestamp <= now / 1000 + 30)) return null;
    return { token, subject };
  } catch { return null; }
}
