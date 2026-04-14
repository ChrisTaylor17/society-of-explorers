import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: community, error } = await supabase
    .from('communities')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error || !community) {
    return NextResponse.json({ error: 'DAO not found' }, { status: 404 });
  }

  const { data: contracts } = await supabase
    .from('community_contracts')
    .select('contract_type, status, parameters')
    .eq('community_id', community.id);

  const governance = contracts?.find((c: any) => c.contract_type === 'governance') || null;
  const infrastructure = contracts?.find((c: any) => c.contract_type === 'infrastructure') || null;

  const { count: memberCount } = await supabase
    .from('community_members')
    .select('*', { count: 'exact', head: true })
    .eq('community_id', community.id);

  const { data: members } = await supabase
    .from('community_members')
    .select('member_id, role, joined_at')
    .eq('community_id', community.id)
    .order('joined_at', { ascending: true })
    .limit(20);

  let memberProfiles: any[] = [];
  if (members && members.length > 0) {
    const ids = members.map(m => m.member_id);
    const { data: profiles } = await supabase
      .from('members')
      .select('id, display_name')
      .in('id', ids);

    memberProfiles = members.map(m => ({
      ...m,
      display_name: profiles?.find(p => p.id === m.member_id)?.display_name || 'Explorer',
    }));
  }

  const { data: products } = await supabase
    .from('dao_products')
    .select('*')
    .eq('community_id', community.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    community,
    contracts: { governance, infrastructure },
    memberCount: memberCount || 0,
    members: memberProfiles,
    products: products || [],
  });
}
