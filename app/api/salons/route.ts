import { NextRequest } from 'next/server';
import { generateSessionSchedule } from '@/lib/salons';
import { emitActivity } from '@/lib/feed/activityFeed';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const TRACKS = ['singularity', 'blockchain', 'consciousness'] as const;
const SALON_LIST_SELECT = 'id,title,description,status,max_members,topic_rotation,members!salons_guide_member_id_fkey(display_name)';
const SALON_CREATE_RECEIPT_SELECT = 'id,title,description,status,max_members,topic_rotation';
const PUBLIC_STATUSES = new Set(['recruiting', 'active', 'graduating', 'completed']);
const MAX_DISPLAY_TEXT = 160;
const MAX_DESCRIPTION_TEXT = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SalonListRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  max_members?: number | null;
  topic_rotation?: string[] | null;
  members?: { display_name?: string | null } | null;
};

type AuthMemberWithGuide = {
  is_guide?: boolean;
};

type SalonCreateBody = {
  title?: unknown;
  description?: unknown;
  community_id?: unknown;
  topic_rotation?: unknown;
};

function publicText(value: unknown, fallback: string, maxLength = MAX_DISPLAY_TEXT) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function nullableText(value: unknown, maxLength = MAX_DISPLAY_TEXT) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function boundedInteger(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(0, Math.trunc(value)), max) : 0;
}

function publicStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 12);
}

function parseStatuses(value: string | null) {
  const requested = (value || 'recruiting,active')
    .split(',')
    .map((status) => status.trim())
    .filter((status) => PUBLIC_STATUSES.has(status));
  return requested.length ? requested : ['recruiting', 'active'];
}

function publicSalonListRow(row: SalonListRow, memberCount: number) {
  const relatedGuide = Array.isArray(row.members) ? row.members[0] : row.members;
  return {
    id: publicText(row.id, 'salon', 80),
    title: publicText(row.title, 'Salon'),
    description: nullableText(row.description, 500),
    status: publicText(row.status, 'recruiting', 32),
    max_members: boundedInteger(row.max_members, 20),
    topic_rotation: publicStringList(row.topic_rotation),
    member_count: boundedInteger(memberCount, 20),
    guide_name: nullableText(relatedGuide?.display_name),
  };
}

async function safeRequestJson(req: NextRequest): Promise<SalonCreateBody | null> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === 'object' ? (parsed as SalonCreateBody) : null;
  } catch {
    return null;
  }
}

function normalizeUuid(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function normalizeTopicRotation(value: unknown) {
  if (!Array.isArray(value)) return [...TRACKS];
  const allowed = new Set<string>(TRACKS);
  const topics = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => allowed.has(item))
    .slice(0, TRACKS.length);
  return topics.length ? topics : [...TRACKS];
}

function publicSalonCreateReceipt(row: SalonListRow) {
  return {
    id: publicText(row.id, 'salon', 80),
    title: publicText(row.title, 'Salon'),
    description: nullableText(row.description, 500),
    status: publicText(row.status, 'recruiting', 32),
    max_members: boundedInteger(row.max_members, 20),
    topic_rotation: publicStringList(row.topic_rotation),
  };
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const communityId = req.nextUrl.searchParams.get('community_id');
  const statuses = parseStatuses(req.nextUrl.searchParams.get('status'));

  let query = supabase.from('salons').select(SALON_LIST_SELECT)
    .in('status', statuses).order('created_at', { ascending: false }).limit(20);

  if (communityId) query = query.eq('community_id', communityId);
  const { data, error } = await query;
  if (error) return privateJson({ salons: [], error: 'Failed to load salons' }, { status: 500 });

  const enriched = await Promise.all(((data || []) as SalonListRow[]).map(async (s) => {
    const { count } = await supabase.from('salon_members').select('id', { count: 'exact', head: true }).eq('salon_id', s.id);
    return publicSalonListRow(s, count || 0);
  }));

  return privateJson({ salons: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const title = publicText(body.title, '', MAX_DISPLAY_TEXT);
  if (!title) return privateJson({ error: 'Title required' }, { status: 400 });

  const description = nullableText(body.description, MAX_DESCRIPTION_TEXT);
  const communityId = normalizeUuid(body.community_id);
  if (typeof body.community_id === 'string' && body.community_id.trim() && !communityId) {
    return privateJson({ error: 'Invalid community_id' }, { status: 400 });
  }
  const topicRotation = normalizeTopicRotation(body.topic_rotation);

  const supabase = getSupabaseAdmin();
  const isGuide = Boolean((auth.member as AuthMemberWithGuide).is_guide);
  const { data: salon, error } = await supabase.from('salons').insert({
    title,
    description,
    community_id: communityId,
    guide_member_id: isGuide ? auth.memberId : null,
    topic_rotation: topicRotation,
  }).select(SALON_CREATE_RECEIPT_SELECT).single();

  if (error || !salon) return privateJson({ error: 'Failed to create salon' }, { status: 500 });
  const salonRow = salon as SalonListRow;

  // Add creator as guide or member
  const { error: memberInsertError } = await supabase.from('salon_members').insert({
    salon_id: salonRow.id,
    member_id: auth.memberId,
    role: isGuide ? 'guide' : 'member',
  });
  if (memberInsertError) return privateJson({ error: 'Failed to attach creator to salon' }, { status: 500 });

  // Generate 35 sessions
  const dates = generateSessionSchedule(new Date(), 7);
  const sessions = dates.map((d, i) => ({
    salon_id: salonRow.id,
    session_date: d.toISOString().slice(0, 10),
    session_number: i + 1,
    track: TRACKS[Math.floor(i / 5) % TRACKS.length],
    topic: `${TRACKS[Math.floor(i / 5) % TRACKS.length]} — Session ${(i % 5) + 1}`,
    led_by_member_id: auth.memberId, // initially all led by creator
  }));
  const { error: sessionsError } = await supabase.from('salon_sessions').insert(sessions);
  if (sessionsError) return privateJson({ error: 'Failed to create salon sessions' }, { status: 500 });

  emitActivity({
    communityId: communityId || undefined,
    memberId: auth.memberId,
    eventType: 'salon_created',
    title: `New salon: "${title}"`,
    metadata: { salonId: salonRow.id },
  }).catch(() => {});

  return privateJson({ salon: publicSalonCreateReceipt(salonRow) });
}
