import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { memberSessionDto } from '@/lib/auth/memberDto';
import { privateJson } from '@/lib/http/routeError';
import { AUTH_PROVIDER_COOKIE } from '@/lib/auth/provider';
import { readWalletSession } from '@/lib/auth/walletSession';

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    const member = auth ? memberSessionDto(auth.member) : null;
    if (!member) {
      const browserSignedOut = req.cookies.get(AUTH_PROVIDER_COOKIE)?.value === 'signed_out';
      const walletSignOutPending = browserSignedOut && await readWalletSession(req.cookies.get('soe_wallet_id')?.value) !== null;
      return privateJson({ error: 'Unauthorized', session: 'signed_out', browserSignedOut,
        ...(walletSignOutPending ? { walletSignOutPending: true } : {}) }, { status: 401 });
    }
    return privateJson({ member, auth: auth!.auth });
  } catch {
    return privateJson({ error: 'Member session is temporarily unavailable.' }, { status: 503 });
  }
}
