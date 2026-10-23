import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type CommunityRow = {
  id: string;
};

type CommunityMemberRow = {
  member_id: string;
  role: string | null;
  joined_at: string | null;
};

type MemberDirectoryRow = {
  id: string;
  display_name: string | null;
  discipline: string | null;
  bio: string | null;
  skills: string[] | null;
  project_description: string | null;
  seeking: string | null;
  exp_tokens: number | null;
  tier: string | null;
};

function parseCommunitySlug(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('community') || 'society-of-explorers';
  return slug.trim().slice(0, 80);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const communitySlug = parseCommunitySlug(req);
    const supabase = getSupabaseAdmin();
    const { data: community, error: communityError } = await supabase
      .from('communities')
      .select('id')
      .eq('slug', communitySlug)
      .single();

    if (communityError || !community) {
      return privateJson({ members: [] });
    }

    const communityRow = community as CommunityRow;
    const { data: members, error: membersError } = await supabase
      .from('community_members')
      .select('member_id, role, joined_at')
      .eq('community_id', communityRow.id)
      .order('joined_at', { ascending: false })
      .limit(50);

    if (membersError) return privateJson({ error: 'Failed to load members' }, { status: 500 });

    const communityMembers = (members || []) as CommunityMemberRow[];
    const memberIds = communityMembers.map((member) => member.member_id);

    if (memberIds.length === 0) {
      return privateJson({ members: [] });
    }

    const { data: memberRows, error: memberError } = await supabase
      .from('members')
      .select('id, display_name, discipline, bio, skills, project_description, seeking, exp_tokens, tier')
      .in('id', memberIds);

    if (memberError) return privateJson({ error: 'Failed to load member profiles' }, { status: 500 });

    const memberById = new Map((memberRows || []).map((member) => [member.id, member as MemberDirectoryRow]));
    const enriched = communityMembers.flatMap((communityMember) => {
      const member = memberById.get(communityMember.member_id);
      if (!member) return [];

      return [{
        ...member,
        role: communityMember.role,
        joined_at: communityMember.joined_at,
      }];
    });

    return privateJson({ members: enriched });
  } catch {
    return privateJson({ error: 'Failed to discover members' }, { status: 500 });
  }
}
