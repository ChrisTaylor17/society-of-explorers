import 'server-only';

import { isUuid } from '@/lib/ids/uuid';
import { privateJson } from '@/lib/http/routeError';
import type { getSupabaseAdmin } from '@/lib/supabase/admin';

/** The caller supplies a verified member ID, never one taken from request input.
 * The existing program grants reading to its assigned guide or a current member.
 * No profile guide flag, public listing, or document cookie grants this access. */
export async function authorizeGuideProgramRead(
  supabase: ReturnType<typeof getSupabaseAdmin>, memberId: string, salonId: string,
) {
  if (!isUuid(memberId) || !isUuid(salonId)) {
    return privateJson({ error: 'Not found' }, { status: 404 });
  }
  try {
    const { data: salon, error: salonError } = await supabase.from('salons')
      .select('id,guide_member_id').eq('id', salonId).maybeSingle();
    if (salonError) throw new Error('Program access unavailable');
    if (!salon) return privateJson({ error: 'Not found' }, { status: 404 });
    if (salon.id !== salonId.toLowerCase()) throw new Error('Program access unavailable');
    if (typeof salon.guide_member_id === 'string' && salon.guide_member_id.toLowerCase() === memberId.toLowerCase()) return null;

    const { data: membership, error: membershipError } = await supabase.from('salon_members')
      .select('id').eq('salon_id', salonId).eq('member_id', memberId).maybeSingle();
    if (membershipError) throw new Error('Program access unavailable');
    if (membership && !isUuid(membership.id)) throw new Error('Program access unavailable');
    return membership ? null : privateJson({ error: 'Forbidden' }, { status: 403 });
  } catch {
    return privateJson({ error: 'Program access is temporarily unavailable' }, { status: 503 });
  }
}
