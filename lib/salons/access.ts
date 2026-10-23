// Security fixes S2/S8/S9: who may read or write a salon's messages.
//   - 'general': any signed-in member.
//   - a UUID salon: its guide (salons.guide_member_id) or a member listed in salon_members.
//   - `private-<memberId>` is NOT handled here; only server code acting for that member touches it.
//   - anything else: nobody (fail closed).
import type { getSupabaseAdmin } from '@/lib/supabase/admin';

export const GENERAL_SALON_ID = 'general';
export const SALON_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Admin = ReturnType<typeof getSupabaseAdmin>;

export async function memberCanUseSharedSalon(supabase: Admin, memberId: string, salonId: string): Promise<boolean> {
  if (!memberId) return false;
  if (salonId === GENERAL_SALON_ID) return true;
  if (!SALON_UUID_RE.test(salonId)) return false;

  const { data: guided, error: guidedError } = await supabase
    .from('salons')
    .select('id')
    .eq('id', salonId)
    .eq('guide_member_id', memberId)
    .limit(1);
  if (!guidedError && (guided || []).length > 0) return true;

  const { data: membership, error: membershipError } = await supabase
    .from('salon_members')
    .select('id')
    .eq('salon_id', salonId)
    .eq('member_id', memberId)
    .limit(1);
  return !membershipError && (membership || []).length > 0;
}
