import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PUBLIC_MEMBER_SELECT, parsePublicMemberProfile, type PublicMemberProfile } from '@/lib/members/profile';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPublicExplorerId(value: string): boolean {
  return UUID_RE.test(value);
}

/** Public display is an explicit current publication choice, never a side effect
 * of membership, answering a question, or knowing a member's profile URL. */
export async function loadPublicExplorerProfile(id: string): Promise<PublicMemberProfile | null> {
  if (!isPublicExplorerId(id)) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('members')
      .select(PUBLIC_MEMBER_SELECT)
      .eq('id', id)
      .eq('profile_visibility', 'public')
      .maybeSingle();
    if (error) throw new Error('Public profile unavailable');
    if (!data) return null;
    const profile = parsePublicMemberProfile(data);
    if (!profile || profile.id.toLowerCase() !== id.toLowerCase()) throw new Error('Public profile unavailable');
    return profile;
  } catch {
    // Never return provider errors, schema names, raw rows, or private activity.
    throw new Error('Public profile unavailable');
  }
}
