import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getCommunityMembersWithRoles, getCommunityRoles, assignRole, checkPermission } from '@/lib/governance/hats';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type AssignRoleBody = {
  actorMemberId?: string;
  targetMemberId?: string;
  roleKey?: string;
};

function trimmedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function roleAssignmentError(error: string | undefined): string {
  if (error === 'Role not found') return error;
  if (error?.startsWith('Maximum ')) return error;
  return 'Role assignment failed';
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = getSupabaseAdmin();
  const roles = await getCommunityRoles(slug);
  const members = await getCommunityMembersWithRoles(slug);
  const { data: community } = await supabase
    .from('communities')
    .select('governance_mode, hats_tree_id')
    .eq('slug', slug)
    .single();

  return privateJson({
    roles,
    members,
    governance_mode: community?.governance_mode || 'offchain',
    hats_tree_id: community?.hats_tree_id || null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: AssignRoleBody;

  try {
    body = (await req.json()) as AssignRoleBody;
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const actorMemberId = trimmedText(body.actorMemberId);
  const targetMemberId = trimmedText(body.targetMemberId);
  const roleKey = trimmedText(body.roleKey);

  if (!targetMemberId || !roleKey) {
    return privateJson({ error: 'targetMemberId and roleKey required' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  if (actorMemberId && actorMemberId !== auth.memberId) {
    return privateJson({ error: 'Cannot assign roles for another actor' }, { status: 403 });
  }

  const canManage = await checkPermission(auth.memberId, slug, 'manage_roles');
  if (!canManage) {
    return privateJson({ error: 'Permission denied: manage_roles required' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: community } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!community) {
    return privateJson({ error: 'Community not found' }, { status: 404 });
  }

  const result = await assignRole(community.id, targetMemberId, roleKey, auth.memberId);
  if (!result.success) {
    return privateJson({ error: roleAssignmentError(result.error) }, { status: 400 });
  }

  return privateJson({ success: true });
}
