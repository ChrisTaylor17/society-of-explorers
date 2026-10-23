import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { initializeRolesForCommunity } from '@/lib/governance/hats';
import { initializeAgentWallets } from '@/lib/wallets/agentWallet';

type CreateCommunityBody = {
  name?: string;
  slug?: string;
  description?: string | null;
  primaryColor?: string | null;
  theme?: string | null;
  mission?: string | null;
  launchConfig?: {
    template?: string | null;
    reputationSymbol?: string | null;
    governanceSymbol?: string | null;
    initialTreasury?: number | null;
    rewards?: {
      contribution?: number | null;
      participation?: number | null;
      analysis?: number | null;
    } | null;
    infrastructure?: {
      dataMethods?: unknown;
      verificationMethod?: string | null;
      hardwareNeeded?: string | null;
      dataGoal?: string | null;
      problemStatement?: string | null;
    } | null;
  } | null;
};

type MembershipRow = {
  community_id: string;
  role: string | null;
};

type CommunityRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  branding?: unknown;
  theme?: string | null;
  [key: string]: unknown;
};

function trimmedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanSlugValue(value: unknown): string {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 50)
    : '';
}

function safeTheme(value: unknown): string {
  const theme = trimmedText(value);
  return theme || 'dark';
}

function safePrimaryColor(value: unknown): string {
  const color = trimmedText(value);
  return color || '#c9a84c';
}

function boundedText(value: unknown, maxLength: number): string | null {
  const text = trimmedText(value);
  return text ? text.slice(0, maxLength) : null;
}

function safeTokenSymbol(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const symbol = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return symbol || fallback;
}

function safePositiveNumber(value: unknown, fallback: number, max: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(max, Math.round(number)));
}

function safeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, maxItems);
}

async function applyCommunityLaunchConfig(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  communityId: string,
  body: CreateCommunityBody,
) {
  const launchConfig = body.launchConfig || {};
  const rewards = launchConfig.rewards || {};
  const infrastructure = launchConfig.infrastructure || {};
  const contribution = safePositiveNumber(rewards.contribution, 10, 100_000);
  const participation = safePositiveNumber(rewards.participation, 5, 100_000);
  const analysis = safePositiveNumber(rewards.analysis, 25, 100_000);
  const maxReward = Math.max(contribution, participation, analysis);

  const limitPayload = {
    max_per_tx: maxReward * 5,
    max_per_day: maxReward * 20,
    max_per_week: maxReward * 100,
    require_human_above: maxReward * 20,
  };

  const { data: updatedLimits, error: updateLimitError } = await supabase
    .from('agent_spending_limits')
    .update(limitPayload)
    .eq('community_id', communityId)
    .eq('agent_key', '*')
    .select('id')
    .limit(1);

  if (updateLimitError) throw updateLimitError;

  if (!updatedLimits || updatedLimits.length === 0) {
    const { error: insertLimitError } = await supabase.from('agent_spending_limits').insert({
      community_id: communityId,
      agent_key: '*',
      ...limitPayload,
    });
    if (insertLimitError) throw insertLimitError;
  }

  const governanceParameters = {
    template: boundedText(launchConfig.template, 80) || 'custom',
    governance_type: 'dao',
    voting_threshold: 51,
    reputation_token: { symbol: safeTokenSymbol(launchConfig.reputationSymbol, 'REP'), soulbound: true, standard: 'Solana Token-2022' },
    governance_token: { symbol: safeTokenSymbol(launchConfig.governanceSymbol, 'GOV'), transferable: true },
    initial_treasury: safePositiveNumber(launchConfig.initialTreasury, 10_000, 1_000_000_000),
    rewards: { contribution, participation, analysis },
  };
  const infrastructureParameters = {
    data_methods: safeStringList(infrastructure.dataMethods, 12),
    verification_method: boundedText(infrastructure.verificationMethod, 120) || 'geo-photo',
    hardware_needed: boundedText(infrastructure.hardwareNeeded, 1_000) || '',
    data_goal: boundedText(infrastructure.dataGoal, 1_000) || '',
    problem_statement: boundedText(infrastructure.problemStatement, 1_500) || '',
  };

  const { error: contractError } = await supabase.from('community_contracts').insert([
    {
      community_id: communityId,
      contract_type: 'governance',
      deployment_status: 'deployed',
      parameters: governanceParameters,
    },
    {
      community_id: communityId,
      contract_type: 'infrastructure',
      deployment_status: 'deployed',
      parameters: infrastructureParameters,
    },
  ]);

  if (contractError) throw contractError;
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  const supabase = getSupabaseAdmin();
  let mine: Array<CommunityRow & { role: string | null }> = [];

  if (auth) {
    const { data: memberships } = await supabase
      .from('community_members')
      .select('community_id, role')
      .eq('member_id', auth.memberId)
      .returns<MembershipRow[]>();

    const communityIds = (memberships || []).map((membership) => membership.community_id);
    const roleByCommunityId = new Map(
      (memberships || []).map((membership) => [membership.community_id, membership.role] as const),
    );

    if (communityIds.length > 0) {
      const { data: communities } = await supabase
        .from('communities')
        .select('*')
        .in('id', communityIds)
        .eq('is_active', true)
        .returns<CommunityRow[]>();

      mine = (communities || []).map((community) => ({
        ...community,
        role: roleByCommunityId.get(community.id) || null,
      }));
    }
  }

  const { data: publicCommunities } = await supabase
    .from('communities')
    .select('id, slug, name, description, branding, theme')
    .eq('is_public', true)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<CommunityRow[]>();

  return privateJson({ mine, discover: publicCommunities || [] });
}

export async function POST(req: NextRequest) {
  let body: CreateCommunityBody;
  try {
    body = (await req.json()) as CreateCommunityBody;
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = trimmedText(body.name);
  const cleanSlug = cleanSlugValue(body.slug);

  if (!name || !cleanSlug) {
    return privateJson({ error: 'Name and slug required' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', cleanSlug)
    .single();

  if (existing) {
    return privateJson({ error: 'Slug already taken' }, { status: 409 });
  }

  const { data: community, error } = await supabase
    .from('communities')
    .insert({
      slug: cleanSlug,
      name,
      description: trimmedText(body.description),
      mission: boundedText(body.mission, 1_500) || trimmedText(body.description),
      governance_type: 'dao',
      branding: { primaryColor: safePrimaryColor(body.primaryColor), theme: safeTheme(body.theme) },
      theme: safeTheme(body.theme),
      owner_member_id: auth.memberId,
      is_public: true,
      is_active: true,
    })
    .select()
    .single();

  if (error || !community) {
    return privateJson({ error: 'Failed to create community' }, { status: 500 });
  }

  const { error: membershipError } = await supabase.from('community_members').insert({
    community_id: community.id,
    member_id: auth.memberId,
    role: 'owner',
  });

  if (membershipError) {
    return privateJson({ error: 'Failed to initialize community owner' }, { status: 500 });
  }

  await initializeRolesForCommunity(community.id, auth.memberId);
  await initializeAgentWallets(community.id).catch(() => undefined);
  try {
    await applyCommunityLaunchConfig(supabase, community.id, body);
  } catch {
    return privateJson({ error: 'Failed to configure community launch settings' }, { status: 500 });
  }

  return privateJson({ community });
}
