import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MEMBER_SELECT = 'id, display_name, bio, discipline, skills, project_description, seeking, philosophy, exp_tokens, tier, coherence_data, supabase_auth_id, wallet_address';

export interface AuthenticatedMember {
  id: string;
  display_name: string;
  bio: string | null;
  discipline: string | null;
  skills: string[] | null;
  project_description: string | null;
  seeking: string | null;
  philosophy: string | null;
  exp_tokens: number;
  tier: string;
  coherence_data: any;
  supabase_auth_id: string | null;
  wallet_address: string | null;
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
): Promise<{ memberId: string; member: AuthenticatedMember } | null> {

  // 1. Try Supabase session (Google OAuth / email-password)
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: member } = await supabaseAdmin
        .from('members')
        .select(MEMBER_SELECT)
        .eq('supabase_auth_id', user.id)
        .single();
      if (member) return { memberId: member.id, member: member as AuthenticatedMember };
    }
  } catch {}

  // 2. Try Bearer token (used by some client-side callers)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const { createClient: createTokenClient } = await import('@supabase/supabase-js');
      const supabaseAuth = createTokenClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      );
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (user) {
        const { data: member } = await supabaseAdmin
          .from('members')
          .select(MEMBER_SELECT)
          .eq('supabase_auth_id', user.id)
          .single();
        if (member) return { memberId: member.id, member: member as AuthenticatedMember };
      }
    } catch {}
  }

  // 3. Try soe_wallet_id cookie (MetaMask/SIWE)
  const walletId = req.cookies.get('soe_wallet_id')?.value;
  if (walletId) {
    const { data: member } = await supabaseAdmin
      .from('members')
      .select(MEMBER_SELECT)
      .eq('id', walletId)
      .single();
    if (member) return { memberId: member.id, member: member as AuthenticatedMember };
  }

  return null;
}
