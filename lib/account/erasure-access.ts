import 'server-only';

import { isWellFormedUuid } from '@/lib/auth/walletSession';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function erasureAllowsAccount(provider: 'supabase' | 'wallet', subject: string): Promise<boolean> {
  // Activate across all hosted app revisions before the owner starts erasure.
  if (process.env.SOE_ACCOUNT_ERASURE_ACCESS_ENABLED !== 'true') return true;
  if (!isWellFormedUuid(subject)) return false;
  try {
    const { data, error } = await getSupabaseAdmin().rpc('soe_account_erasure_access_allowed', {
      p_provider: provider, p_subject: subject,
    }).abortSignal(AbortSignal.timeout(3_000));
    return !error && data === true;
  } catch {
    return false;
  }
}
