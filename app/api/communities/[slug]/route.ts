import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const COMMUNITY_DETAIL_SELECT = 'id, slug, name, description, mission, owner_member_id';
const CONTRACT_SELECT = 'contract_type, status, parameters';
const COMMUNITY_MEMBER_SELECT = 'member_id, role';
const MEMBER_PROFILE_SELECT = 'id, display_name';
const PRODUCT_SELECT = 'id, name, description, image_url, price_rep, is_token_gated, created_at';

type CommunityContractRow = {
  contract_type: string | null;
  status: string | null;
  parameters: Record<string, unknown> | null;
};

type CommunityMemberRow = {
  member_id: string;
  role: string | null;
};

type MemberProfileRow = {
  id: string;
  display_name: string | null;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = getSupabaseAdmin();

  const { data: community, error } = await supabase
    .from('communities')
    .select(COMMUNITY_DETAIL_SELECT)
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error || !community) {
    return privateJson({ error: 'DAO not found' }, { status: 404 });
  }

  const { data: contracts } = await supabase
    .from('community_contracts')
    .select(CONTRACT_SELECT)
    .eq('community_id', community.id)
    .returns<CommunityContractRow[]>();

  const governance = contracts?.find((contract) => contract.contract_type === 'governance') || null;
  const infrastructure = contracts?.find((contract) => contract.contract_type === 'infrastructure') || null;

  const { count: memberCount } = await supabase
    .from('community_members')
    .select('member_id', { count: 'exact', head: true })
    .eq('community_id', community.id);

  const { data: members } = await supabase
    .from('community_members')
    .select(COMMUNITY_MEMBER_SELECT)
    .eq('community_id', community.id)
    .order('joined_at', { ascending: true })
    .limit(20)
    .returns<CommunityMemberRow[]>();

  let memberProfiles: Array<CommunityMemberRow & { display_name: string }> = [];
  if (members && members.length > 0) {
    const ids = members.map((member) => member.member_id);
    const { data: profiles } = await supabase
      .from('members')
      .select(MEMBER_PROFILE_SELECT)
      .in('id', ids)
      .returns<MemberProfileRow[]>();

    const displayNameByMemberId = new Map(
      (profiles || []).map((profile) => [profile.id, profile.display_name || 'Explorer'] as const),
    );

    memberProfiles = members.map((member) => ({
      member_id: member.member_id,
      role: member.role,
      display_name: displayNameByMemberId.get(member.member_id) || 'Explorer',
    }));
  }

  const { data: products } = await supabase
    .from('dao_products')
    .select(PRODUCT_SELECT)
    .eq('community_id', community.id)
    .order('created_at', { ascending: false });

  return privateJson({
    community,
    contracts: { governance, infrastructure },
    memberCount: memberCount || 0,
    members: memberProfiles,
    products: products || [],
  });
}
