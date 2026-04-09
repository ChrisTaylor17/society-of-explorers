import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { initializeRolesForCommunity } from '@/lib/governance/hats';
import { initializeAgentWallets } from '@/lib/wallets/agentWallet';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const memberId = req.headers.get('x-member-id');

  if (memberId) {
    const { data: memberships } = await supabase
      .from('community_members')
      .select('community_id, role')
      .eq('member_id', memberId);

    const mine: any[] = [];
    if (memberships) {
      for (const m of memberships) {
        const { data: c } = await supabase.from('communities').select('*').eq('id', m.community_id).eq('is_active', true).single();
        if (c) mine.push({ ...c, role: m.role });
      }
    }

    const { data: publicCommunities } = await supabase
      .from('communities')
      .select('*')
      .eq('is_public', true)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({ mine, discover: publicCommunities || [] });
  }

  const { data } = await supabase
    .from('communities')
    .select('id, slug, name, description, branding, theme')
    .eq('is_public', true)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ mine: [], discover: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, slug, description, primaryColor, theme, memberId } = body;

  if (!name || !slug || !memberId) {
    return NextResponse.json({ error: 'Name, slug, and memberId required' }, { status: 400 });
  }

  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 50);

  const { data: existing } = await supabase.from('communities').select('id').eq('slug', cleanSlug).single();
  if (existing) return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });

  const { data: community, error } = await supabase.from('communities').insert({
    slug: cleanSlug,
    name: name.trim(),
    description: description?.trim() || null,
    branding: { primaryColor: primaryColor || '#c9a84c', theme: theme || 'dark' },
    theme: theme || 'dark',
    owner_member_id: memberId,
    is_public: true,
    is_active: true,
  }).select().single();

  if (error) {
    console.error('Community create error:', error);
    return NextResponse.json({ error: 'Failed to create community' }, { status: 500 });
  }

  await supabase.from('community_members').insert({ community_id: community.id, member_id: memberId, role: 'owner' });

  // Initialize governance roles
  await initializeRolesForCommunity(community.id, memberId);

  // Initialize agent wallets and treasury
  await initializeAgentWallets(community.id).catch(err => console.error('[community] wallet init error:', err));

  return NextResponse.json({ community });
}
