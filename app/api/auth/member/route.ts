import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { memberSessionDto } from '@/lib/auth/memberDto';
import { privateJson } from '@/lib/http/routeError';
import { AUTH_PROVIDER_COOKIE } from '@/lib/auth/provider';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    const member = auth ? memberSessionDto(auth.member) : null;
    if (!member) return privateJson({ error: 'Unauthorized', session: 'signed_out', browserSignedOut: req.cookies.get(AUTH_PROVIDER_COOKIE)?.value === 'signed_out' }, { status: 401 });
    return privateJson({ member, auth: auth!.auth });
  } catch {
    return privateJson({ error: 'Member session is temporarily unavailable.' }, { status: 503 });
  }
}
