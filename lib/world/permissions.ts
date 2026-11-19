import { getMemberSession } from '@/lib/auth/getSession';
import { createClient } from '@/lib/supabase/server';

type HostSessionMember = {
  id: string;
  supabase_auth_id?: string | null;
};

export function isHostedByCurrentMember(
  hostId: string | null | undefined,
  member: HostSessionMember | null | undefined,
): boolean {
  if (!hostId || !member) return false;
  return hostId === member.id || hostId === member.supabase_auth_id;
}

/**
 * Check if the current member can access a space.
 * Active spaces are accessible to all authenticated members.
 * Pending/archived spaces are only accessible to their host.
 */
export async function canAccessSpace(spaceId: string): Promise<{ allowed: boolean; memberId: string | null }> {
  const session = await getMemberSession();
  if (!session) return { allowed: false, memberId: null };

  const supabase = await createClient();
  const { data: space } = await supabase
    .from('spaces')
    .select('status, host_id')
    .eq('id', spaceId)
    .single();

  if (!space) return { allowed: false, memberId: session.member.id };

  if (space.status === 'active') {
    return { allowed: true, memberId: session.member.id };
  }

  const isHost = isHostedByCurrentMember(space.host_id, session.member);
  return { allowed: isHost, memberId: session.member.id };
}

/**
 * Validate a host-initiated access request. The current spaces schema has no
 * collaborator relation, so this must fail closed until one is introduced.
 */
export async function grantAccess(spaceId: string, targetMemberId: string): Promise<{ success: boolean; error?: string }> {
  if (!targetMemberId.trim()) return { success: false, error: 'Target member is required' };

  const session = await getMemberSession();
  if (!session) return { success: false, error: 'Not authenticated' };

  const supabase = await createClient();
  const { data: space } = await supabase
    .from('spaces')
    .select('host_id')
    .eq('id', spaceId)
    .single();

  if (!space) return { success: false, error: 'Space not found' };
  if (!isHostedByCurrentMember(space.host_id, session.member)) {
    return { success: false, error: 'Only the host can grant access' };
  }

  return { success: false, error: 'Space collaboration access is not configured' };
}
