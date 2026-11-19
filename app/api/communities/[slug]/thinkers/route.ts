import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { checkPermission } from '@/lib/governance/hats';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const COMMUNITY_THINKER_SELECT = 'id, thinker_key, name, avatar, color, mandate, persona_lens, sort_order';
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

type CommunityThinkerBody = {
  id?: unknown;
  thinker_key?: unknown;
  name?: unknown;
  avatar?: unknown;
  color?: unknown;
  mandate?: unknown;
  persona_lens?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
};

type CommunityThinkerUpdate = {
  thinker_key?: string;
  name?: string;
  avatar?: string;
  color?: string;
  mandate?: string;
  persona_lens?: string;
  sort_order?: number;
  is_active?: boolean;
};

function boundedText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function cleanThinkerKey(value: unknown): string | null {
  const key = boundedText(value, 80)?.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 64);
  return key || null;
}

function safeAvatar(value: unknown, name: string): string {
  const avatar = boundedText(value, 8) || name.slice(0, 2);
  return avatar.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2) || 'EX';
}

function safeColor(value: unknown): string {
  const color = boundedText(value, 16);
  return color && HEX_COLOR_PATTERN.test(color) ? color : '#c9a84c';
}

function safeSortOrder(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(99, Math.round(value)));
}

async function safeRequestJson(req: NextRequest): Promise<CommunityThinkerBody | null> {
  try {
    return (await req.json()) as CommunityThinkerBody;
  } catch {
    return null;
  }
}

async function requireManageThinkers(req: NextRequest, slug: string) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return { ok: false as const, status: 401, error: 'Authentication required' };

  const communityId = await loadCommunityId(slug);
  if (!communityId) return { ok: false as const, status: 404, error: 'Community not found' };

  const canManage = await checkPermission(auth.memberId, slug, 'manage_thinkers');
  if (!canManage) return { ok: false as const, status: 403, error: 'Permission denied: manage_thinkers required' };

  return { ok: true as const, communityId };
}

async function loadCommunityId(slug: string) {
  const supabase = getSupabaseAdmin();
  const { data: community } = await supabase.from('communities').select('id').eq('slug', slug).single();
  return community?.id || null;
}

function buildThinkerUpdate(body: CommunityThinkerBody): CommunityThinkerUpdate {
  const update: CommunityThinkerUpdate = {};
  const thinkerKey = cleanThinkerKey(body.thinker_key);
  const name = boundedText(body.name, 80);
  const mandate = boundedText(body.mandate, 1_500);
  const personaLens = boundedText(body.persona_lens, 1_500);
  const sortOrder = safeSortOrder(body.sort_order);

  if (thinkerKey) update.thinker_key = thinkerKey;
  if (name) {
    update.name = name;
    update.avatar = safeAvatar(body.avatar, name);
  } else if (typeof body.avatar === 'string') {
    update.avatar = safeAvatar(body.avatar, 'EX');
  }
  if (typeof body.color === 'string') update.color = safeColor(body.color);
  if (mandate) update.mandate = mandate;
  if (personaLens) update.persona_lens = personaLens;
  if (sortOrder !== null) update.sort_order = sortOrder;
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active;

  return update;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const communityId = await loadCommunityId(slug);
  if (!communityId) return privateJson({ error: 'Community not found' }, { status: 404 });

  const supabase = getSupabaseAdmin();
  const { data: thinkers } = await supabase
    .from('community_thinkers')
    .select(COMMUNITY_THINKER_SELECT)
    .eq('community_id', communityId)
    .eq('is_active', true)
    .order('sort_order');

  return privateJson({ thinkers: thinkers || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid JSON body' }, { status: 400 });

  const thinkerKey = cleanThinkerKey(body.thinker_key);
  const name = boundedText(body.name, 80);
  const mandate = boundedText(body.mandate, 1_500);
  const personaLens = boundedText(body.persona_lens, 1_500);
  if (!thinkerKey || !name || !mandate || !personaLens) {
    return privateJson({ error: 'thinker_key, name, mandate, and persona_lens required' }, { status: 400 });
  }

  const access = await requireManageThinkers(req, slug);
  if (!access.ok) return privateJson({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from('community_thinkers')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', access.communityId)
    .eq('is_active', true);

  if ((count || 0) >= 8) return privateJson({ error: 'Maximum 8 thinkers per community' }, { status: 400 });

  const { data: thinker, error } = await supabase.from('community_thinkers').insert({
    community_id: access.communityId,
    thinker_key: thinkerKey,
    name,
    avatar: safeAvatar(body.avatar, name),
    color: safeColor(body.color),
    mandate,
    persona_lens: personaLens,
    sort_order: count || 0,
  }).select(COMMUNITY_THINKER_SELECT).single();

  if (error) return privateJson({ error: 'Failed to create thinker' }, { status: 500 });
  return privateJson({ thinker });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid JSON body' }, { status: 400 });

  const id = boundedText(body.id, 80);
  if (!id) return privateJson({ error: 'Thinker id required' }, { status: 400 });

  const updates = buildThinkerUpdate(body);
  if (Object.keys(updates).length === 0) {
    return privateJson({ error: 'No valid thinker fields supplied' }, { status: 400 });
  }

  const access = await requireManageThinkers(req, slug);
  if (!access.ok) return privateJson({ error: access.error }, { status: access.status });

  const supabase = getSupabaseAdmin();
  const { data: thinker, error } = await supabase
    .from('community_thinkers')
    .update(updates)
    .eq('id', id)
    .eq('community_id', access.communityId)
    .select(COMMUNITY_THINKER_SELECT).single();

  if (error) return privateJson({ error: 'Update failed' }, { status: 500 });
  return privateJson({ thinker });
}
