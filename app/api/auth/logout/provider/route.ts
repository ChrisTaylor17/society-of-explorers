import type { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { authWriteOriginAllowed, readAuthJson } from '@/lib/auth/request';
import { AUTH_PROVIDER_COOKIE } from '@/lib/auth/provider';
import { AUTH_INTENT_COOKIE, AUTH_INTENT_HEADER, AUTH_SELECTION_COOKIE, parseBrowserIntent, parseBrowserSelection } from '@/lib/auth/browserIntent';
import { revokeSupabaseBrowserSession } from '@/lib/auth/supabaseBrowserLogout';

export async function POST(req: NextRequest) {
  if (!authWriteOriginAllowed(req) || (!req.headers.get('origin') && req.headers.get('sec-fetch-site') !== 'same-origin')) {
    return privateJson({ error: 'Use this site to sign out.' }, { status: 403 });
  }
  const body = await readAuthJson(req);
  const requestId = parseBrowserIntent(body?.requestId), previousIntent = parseBrowserIntent(body?.previousIntent);
  if (!body || Object.keys(body).sort().join(',') !== 'previousIntent,requestId' || !requestId || !previousIntent) {
    return privateJson({ error: 'Invalid provider sign-out request.' }, { status: 400 });
  }
  const intent = parseBrowserIntent(req.headers.get(AUTH_INTENT_HEADER));
  if (!intent || intent === previousIntent || req.cookies.get(AUTH_INTENT_COOKIE)?.value !== intent) {
    return privateJson({ error: 'Account choice changed.' }, { status: 409 });
  }
  const cookies = req.headers.get('cookie') ?? '';
  if (cookies.length > 32_768) return privateJson({ error: 'Provider sign-out is unavailable.' }, { status: 400 });
  const reply = (state: 'revoked' | 'unconfirmed' | 'not_applicable') => privateJson({ requestId, state });
  if (req.cookies.get(AUTH_PROVIDER_COOKIE)?.value !== 'supabase') return reply('not_applicable');
  const selection = parseBrowserSelection(req.cookies.get(AUTH_SELECTION_COOKIE)?.value);
  if (selection?.provider !== 'supabase' || selection.intent !== previousIntent) return reply('unconfirmed');
  return reply(await revokeSupabaseBrowserSession(cookies, selection.subject) ? 'revoked' : 'unconfirmed');
}
