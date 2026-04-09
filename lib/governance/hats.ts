import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const PERMISSIONS = [
  'manage_thinkers', 'manage_members', 'mint_nft', 'use_council',
  'manage_roles', 'manage_branding', 'manage_governance', 'deep_dive', 'voice_sessions',
] as const;

export type Permission = typeof PERMISSIONS[number];

export interface CommunityRole {
  id: string;
  role_key: string;
  display_name: string;
  description: string | null;
  parent_role_key: string | null;
  permissions: Permission[];
  hat_id: number | null;
  max_holders: number | null;
  sort_order: number;
}

const DEFAULT_ROLES: Omit<CommunityRole, 'id'>[] = [
  { role_key: 'owner', display_name: 'Owner', description: 'Full control', parent_role_key: null, permissions: ['manage_thinkers', 'manage_members', 'mint_nft', 'use_council', 'manage_roles', 'manage_branding', 'manage_governance', 'deep_dive', 'voice_sessions'], hat_id: null, max_holders: 1, sort_order: 0 },
  { role_key: 'admin', display_name: 'Admin', description: 'Manage thinkers, members, branding', parent_role_key: 'owner', permissions: ['manage_thinkers', 'manage_members', 'mint_nft', 'use_council', 'manage_branding', 'deep_dive', 'voice_sessions'], hat_id: null, max_holders: 5, sort_order: 1 },
  { role_key: 'moderator', display_name: 'Moderator', description: 'Moderate and manage basic settings', parent_role_key: 'admin', permissions: ['manage_members', 'use_council', 'mint_nft', 'deep_dive', 'voice_sessions'], hat_id: null, max_holders: null, sort_order: 2 },
  { role_key: 'member', display_name: 'Member', description: 'Standard community member', parent_role_key: 'moderator', permissions: ['use_council'], hat_id: null, max_holders: null, sort_order: 3 },
];

export async function initializeRolesForCommunity(communityId: string, ownerMemberId: string): Promise<void> {
  const { data: roles, error } = await supabase
    .from('community_roles')
    .insert(DEFAULT_ROLES.map(r => ({ community_id: communityId, ...r })))
    .select();

  if (error) { console.error('[hats] initializeRoles error:', error); return; }

  const ownerRole = roles?.find(r => r.role_key === 'owner');
  if (ownerRole) {
    await supabase.from('community_members').update({ role_id: ownerRole.id }).eq('community_id', communityId).eq('member_id', ownerMemberId);
  }

  await logGovernanceAction(communityId, ownerMemberId, 'roles_initialized', null, null, { roles_created: DEFAULT_ROLES.map(r => r.role_key) });
}

export async function getMemberRoles(memberId: string, communitySlug: string): Promise<{ member_id: string; role_key: string; display_name: string; permissions: Permission[] } | null> {
  const { data: community } = await supabase.from('communities').select('id').eq('slug', communitySlug).single();
  if (!community) return null;

  const { data } = await supabase
    .from('community_members')
    .select('member_id, role, role_id')
    .eq('member_id', memberId)
    .eq('community_id', community.id)
    .single();

  if (!data) return null;

  if (data.role_id) {
    const { data: cr } = await supabase.from('community_roles').select('role_key, display_name, permissions').eq('id', data.role_id).single();
    if (cr) return { member_id: memberId, role_key: cr.role_key, display_name: cr.display_name, permissions: cr.permissions || [] };
  }

  const { data: role } = await supabase.from('community_roles').select('role_key, display_name, permissions').eq('community_id', community.id).eq('role_key', data.role || 'member').single();
  if (role) return { member_id: memberId, role_key: role.role_key, display_name: role.display_name, permissions: role.permissions || [] };

  return { member_id: memberId, role_key: data.role || 'member', display_name: data.role || 'Member', permissions: ['use_council'] };
}

export async function checkPermission(memberId: string, communitySlug: string, permission: Permission): Promise<boolean> {
  const memberRole = await getMemberRoles(memberId, communitySlug);
  if (!memberRole) return false;
  return memberRole.permissions.includes(permission);
}

export async function assignRole(communityId: string, targetMemberId: string, roleKey: string, actorMemberId: string): Promise<{ success: boolean; error?: string }> {
  const { data: role } = await supabase.from('community_roles').select('*').eq('community_id', communityId).eq('role_key', roleKey).single();
  if (!role) return { success: false, error: 'Role not found' };

  if (role.max_holders) {
    const { count } = await supabase.from('community_members').select('*', { count: 'exact', head: true }).eq('community_id', communityId).eq('role_id', role.id);
    if ((count || 0) >= role.max_holders) return { success: false, error: `Maximum ${role.max_holders} holders for ${role.display_name}` };
  }

  const { error } = await supabase.from('community_members').update({ role_id: role.id, role: roleKey }).eq('community_id', communityId).eq('member_id', targetMemberId);
  if (error) return { success: false, error: error.message };

  await logGovernanceAction(communityId, actorMemberId, 'role_assigned', targetMemberId, roleKey, {});
  return { success: true };
}

export async function getCommunityRoles(communitySlug: string): Promise<CommunityRole[]> {
  const { data: community } = await supabase.from('communities').select('id').eq('slug', communitySlug).single();
  if (!community) return [];
  const { data } = await supabase.from('community_roles').select('*').eq('community_id', community.id).order('sort_order');
  return (data || []) as CommunityRole[];
}

export async function getCommunityMembersWithRoles(communitySlug: string): Promise<any[]> {
  const { data: community } = await supabase.from('communities').select('id').eq('slug', communitySlug).single();
  if (!community) return [];

  const { data } = await supabase
    .from('community_members')
    .select('member_id, role, role_id, joined_at')
    .eq('community_id', community.id)
    .order('joined_at');

  if (!data) return [];

  const results: any[] = [];
  for (const m of data) {
    const { data: member } = await supabase.from('members').select('display_name').eq('id', m.member_id).single();
    let roleInfo = { role_key: m.role || 'member', display_name: m.role || 'Member', permissions: ['use_council'] as string[] };
    if (m.role_id) {
      const { data: cr } = await supabase.from('community_roles').select('role_key, display_name, permissions').eq('id', m.role_id).single();
      if (cr) roleInfo = cr;
    }
    results.push({
      member_id: m.member_id,
      display_name: member?.display_name || 'Unknown',
      role_key: roleInfo.role_key,
      display_role: roleInfo.display_name,
      permissions: roleInfo.permissions,
      joined_at: m.joined_at,
    });
  }
  return results;
}

export async function activateOnChain(_communityId: string, _deployerAddress: string): Promise<{ success: boolean; error?: string }> {
  console.log('[hats] activateOnChain called — not yet implemented');
  return { success: false, error: 'On-chain activation coming soon. Using off-chain governance.' };
}

async function logGovernanceAction(communityId: string, actorMemberId: string, action: string, targetMemberId: string | null, targetRoleKey: string | null, details: any): Promise<void> {
  const { error } = await supabase.from('governance_log').insert({ community_id: communityId, actor_member_id: actorMemberId, action, target_member_id: targetMemberId, target_role_key: targetRoleKey, details });
  if (error) console.error('[hats] governance log error:', error);
}
