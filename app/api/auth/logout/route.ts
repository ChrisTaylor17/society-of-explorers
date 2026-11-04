import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { authWriteOriginAllowed, readAuthJson } from '@/lib/auth/request';
import { AUTH_PROVIDER_COOKIE } from '@/lib/auth/provider';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ownedAuthCookie = (name: string) => ['soe_wallet_id', 'soe_siwe_nonce', 'sb-access-token', 'sb-refresh-token'].includes(name)
  || /^sb-[A-Za-z0-9_-]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/.test(name);

export async function POST(req: NextRequest) {
  if (!authWriteOriginAllowed(req) || (!req.headers.get('origin') && req.headers.get('sec-fetch-site') !== 'same-origin')) {
    return privateJson({ error: 'Use this site to sign out.' }, { status: 403 });
  }
  const body = await readAuthJson(req);
  if (!body || Object.keys(body).sort().join(',') !== 'requestId,scope' || body.scope !== 'browser' ||
      typeof body.requestId !== 'string' || !UUID.test(body.requestId)) {
    return privateJson({ error: 'Invalid browser sign-out request.' }, { status: 400 });
  }
  const cookies = req.headers.get('cookie') || '';
  if (cookies.length > 32_768) return privateJson({ error: 'Browser sign-out is unavailable.' }, { status: 400 });
  const response = privateJson({ outcome: 'signed_out', scope: 'browser', requestId: body.requestId.toLowerCase(), remoteRevocation: 'not_confirmed' });
  const options = { httpOnly: true, path: '/', secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const };
  const names = new Set(['soe_wallet_id', 'soe_siwe_nonce', 'sb-access-token', 'sb-refresh-token']);
  for (const entry of cookies.split(';')) {
    const name = entry.split('=', 1)[0].trim();
    if (ownedAuthCookie(name)) names.add(name);
  }
  for (const name of names) response.cookies.set(name, '', { ...options, maxAge: 0, expires: new Date(0) });
  // In-flight SDK refresh can recreate its own cookies, but cannot remove this
  // httpOnly refusal marker. Only deliberate verified sign-in replaces it.
  response.cookies.set(AUTH_PROVIDER_COOKIE, 'signed_out', { ...options, maxAge: 30 * 24 * 60 * 60 });
  return response;
}
