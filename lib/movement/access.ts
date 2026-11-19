import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export interface MovementAccess {
  memberId: string;
  canManage: boolean;
  reason: 'oracle' | 'founder' | 'none';
}

export async function getMovementAccess(req: NextRequest): Promise<MovementAccess | null> {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return null;

  const tier = (auth.member.tier || '').toLowerCase();
  if (tier === 'oracle') {
    return { memberId: auth.memberId, canManage: true, reason: 'oracle' };
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('members')
      .select('id, is_founder')
      .eq('id', auth.memberId)
      .maybeSingle();
    if (error) {
      console.error('[movement/access] founder lookup failed', {
        memberId: auth.memberId,
        message: error.message,
      });
    }
    if (data && Boolean((data as { is_founder?: boolean }).is_founder)) {
      return { memberId: auth.memberId, canManage: true, reason: 'founder' };
    }
  } catch (err) {
    console.error('[movement/access] founder lookup threw', err);
  }

  return { memberId: auth.memberId, canManage: false, reason: 'none' };
}
