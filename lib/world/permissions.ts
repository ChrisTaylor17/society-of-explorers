import { getMemberSession } from '@/lib/auth/getSession';
import { createClient } from '@/lib/supabase/client';

/**
 * Check if the current member can access a space.
 * Active spaces are accessible to all authenticated members.
 * Pending/archived spaces are only accessible to their host.
 */
export async function canAccessSpace(spaceId: string): Promise<{ allowed: boolean; memberId: string | null }> {
  const session = await getMemberSession();
  if (!session) return { allowed: false, memberId: null };

  const supabase = createClient();
  const { data: space } = await supabase
    .from('spaces')
    .select('status, host_id')
    .eq('id', spaceId)
    .single();

  if (!space) return { allowed: false, memberId: session.member.id };

  if (space.status === 'active') {
    return { allowed: true, memberId: session.member.id };
  }

  const isHost = space.host_id === session.member.supabase_auth_id;
  return { allowed: isHost, memberId: session.member.id };
}

/**
 * Grant a member access to a space by making them a collaborator.
 * Only the host can grant access.
 */
export async function grantAccess(spaceId: string, targetMemberId: string): Promise<{ success: boolean; error?: string }> {
  const session = await getMemberSession();
  if (!session) return { success: false, error: 'Not authenticated' };

  const supabase = createClient();
  const { data: space } = await supabase
    .from('spaces')
    .select('host_id')
    .eq('id', spaceId)
    .single();

  if (!space) return { success: false, error: 'Space not found' };
  if (space.host_id !== session.member.supabase_auth_id) {
    return { success: false, error: 'Only the host can grant access' };
  }

  return { success: true };
}
