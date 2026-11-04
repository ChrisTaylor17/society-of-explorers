import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AUTH_PROVIDER_COOKIE } from '@/lib/auth/provider';
import { isWellFormedUuid, verifyWalletSessionValue } from '@/lib/auth/walletSession';

const MEMBER_SELECT = 'id, display_name, email, bio, discipline, skills, project_description, seeking, philosophy, exp_tokens, tier, coherence_data, total_responses, supabase_auth_id, wallet_address';

export interface AuthenticatedMember {
  id: string;
  display_name: string;
  email: string | null;
  bio: string | null;
  discipline: string | null;
  skills: string[] | null;
  project_description: string | null;
  seeking: string | null;
  philosophy: string | null;
  exp_tokens: number;
  tier: string;
  coherence_data: unknown;
  supabase_auth_id: string | null;
  wallet_address: string | null;
}

async function getMemberByColumn(
  column: 'supabase_auth_id' | 'id',
  value: string,
): Promise<AuthenticatedMember | null> {
  const { data: member, error } = await getSupabaseAdmin()
    .from('members')
    .select(MEMBER_SELECT)
    .eq(column, value)
    .single();

  if (error || !member || typeof member.id !== 'string' || !isWellFormedUuid(member.id)) return null;
  const owner = member[column];
  if (typeof owner !== 'string' || owner.toLowerCase() !== value.toLowerCase()) return null;
  return member as AuthenticatedMember;
}

/**
 * Unified auth helper that works for all three auth methods:
 *   1. Google OAuth / email-password (Supabase session cookie)
 *   2. MetaMask/SIWE (soe_wallet_id cookie)
 *   3. Bearer token in Authorization header
 *
 * Returns the member row or null if unauthenticated.
 */
export async function getAuthenticatedMember(
  req: NextRequest,
): Promise<{ memberId: string; member: AuthenticatedMember; auth: { provider: 'supabase' | 'wallet'; subject: string } } | null> {
  // A browser logout marker also refuses retained SDK bearer tokens.
  if (req.cookies.get(AUTH_PROVIDER_COOKIE)?.value === 'signed_out') return null;

  // An explicit bearer is one authority choice. Invalid/unprovisioned bearer
  // credentials must never fall through to somebody else's browser cookies.
  const authHeader = req.headers.get('authorization');
  if (authHeader !== null) {
    if (!/^Bearer [^\s]+$/.test(authHeader) || authHeader.length > 16_384) return null;
    try {
      const token = authHeader.slice(7);
      const { createClient: createTokenClient } = await import('@supabase/supabase-js');
      const supabaseAuth = createTokenClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
      );
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
      if (error || !user) return null;
      const member = await getMemberByColumn('supabase_auth_id', user.id);
      return member ? { memberId: member.id, member, auth: { provider: 'supabase' as const, subject: user.id } } : null;
    } catch { return null; }
  }

  const selected = req.cookies.get(AUTH_PROVIDER_COOKIE)?.value;
  if (selected !== undefined && selected !== 'supabase' && selected !== 'wallet') return null;
  const walletIdentity = async () => {
    const walletId = await verifyWalletSessionValue(req.cookies.get('soe_wallet_id')?.value);
    if (!walletId) return null;
    const member = await getMemberByColumn('id', walletId);
    return member ? { memberId: member.id, member, auth: { provider: 'wallet' as const, subject: member.id } } : null;
  };
  if (selected === 'wallet') return walletIdentity();

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user) {
      if (error) return null;
      const member = await getMemberByColumn('supabase_auth_id', user.id);
      return member ? { memberId: member.id, member, auth: { provider: 'supabase' as const, subject: user.id } } : null;
    }
    // Only a definite absence permits wallet fallback. Network/verification
    // failures must not silently switch the active account.
    if (error && error.name !== 'AuthSessionMissingError') return null;
  } catch { return null; }

  // A deliberate Supabase choice never falls back to a retained wallet.
  return selected === 'supabase' ? null : walletIdentity();
}
