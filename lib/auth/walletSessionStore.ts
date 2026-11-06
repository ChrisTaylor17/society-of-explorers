import 'server-only';

import { signWithWalletSessionSecret, type VerifiedWalletSession } from '@/lib/auth/walletSession';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function walletSessionAccess(session: VerifiedWalletSession, action: 'check' | 'revoke'): Promise<boolean> {
  try {
    const digest = await signWithWalletSessionSecret(`wallet-session-access|${session.value}`);
    if (!digest) return false;
    const { data, error } = await getSupabaseAdmin().rpc('soe_wallet_session_access', {
      p_digest: digest,
      p_expires_at: session.expiresAt,
      p_revoke: action === 'revoke',
    }).abortSignal(AbortSignal.timeout(3000));
    return !error && data === true;
  } catch {
    return false;
  }
}
