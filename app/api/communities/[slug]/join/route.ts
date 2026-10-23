import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const auth = await getAuthenticatedMember(req);
  if (!auth) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: community } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (!community) {
    return privateJson({ error: 'Community not found' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('community_members')
    .select('id')
    .eq('community_id', community.id)
    .eq('member_id', auth.memberId)
    .single();

  if (existing) {
    return privateJson({ success: true, already_member: true });
  }

  const { error: insertError } = await supabase.from('community_members').insert({
    community_id: community.id,
    member_id: auth.memberId,
    role: 'member',
  });

  if (insertError) {
    return privateJson({ error: 'Failed to join community' }, { status: 500 });
  }

  const { data: memberRole } = await supabase
    .from('community_roles')
    .select('id')
    .eq('community_id', community.id)
    .eq('role_key', 'member')
    .single();

  if (memberRole) {
    const { error: roleError } = await supabase
      .from('community_members')
      .update({ role_id: memberRole.id })
      .eq('community_id', community.id)
      .eq('member_id', auth.memberId);

    if (roleError) {
      return privateJson({ error: 'Joined community but failed to assign member role' }, { status: 500 });
    }
  }

  return privateJson({ success: true });
}
