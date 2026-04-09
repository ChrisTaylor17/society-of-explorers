import { NextRequest, NextResponse } from 'next/server';
import { getCommunityRoles, getCommunityMembersWithRoles, assignRole, checkPermission } from '@/lib/governance/hats';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const roles = await getCommunityRoles(slug);
  const members = await getCommunityMembersWithRoles(slug);
  const { data: community } = await supabase.from('communities').select('governance_mode, hats_tree_id').eq('slug', slug).single();

  return NextResponse.json({
    roles,
    members,
    governance_mode: community?.governance_mode || 'offchain',
    hats_tree_id: community?.hats_tree_id || null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { actorMemberId, targetMemberId, roleKey } = await req.json();

  if (!actorMemberId || !targetMemberId || !roleKey) {
    return NextResponse.json({ error: 'actorMemberId, targetMemberId, roleKey required' }, { status: 400 });
  }

  const canManage = await checkPermission(actorMemberId, slug, 'manage_roles');
  if (!canManage) return NextResponse.json({ error: 'Permission denied: manage_roles required' }, { status: 403 });

  const { data: community } = await supabase.from('communities').select('id').eq('slug', slug).single();
  if (!community) return NextResponse.json({ error: 'Community not found' }, { status: 404 });

  const result = await assignRole(community.id, targetMemberId, roleKey, actorMemberId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ success: true });
}
