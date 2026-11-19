import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { generateSessionSchedule } from '@/lib/salons';
import { emitActivity } from '@/lib/feed/activityFeed';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const TRACKS = ['singularity', 'blockchain', 'consciousness'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SALON_CREATE_RECEIPT_SELECT = 'id, title, status, community_id, parent_salon_id';
const PARENT_SALON_SELECT = 'id, community_id, status';
const MAX_TITLE_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 1000;

type GuideMember = {
  display_name?: string | null;
  is_guide?: boolean | null;
};

type CreateSalonBody = {
  title?: unknown;
  description?: unknown;
  community_id?: unknown;
  parent_salon_id?: unknown;
};

type SalonRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  community_id: string | null;
  parent_salon_id: string | null;
};

type ParentSalonRow = {
  id?: unknown;
  community_id?: unknown;
  status?: unknown;
};

type MemberSalonCountRow = {
  salons_led?: unknown;
};

async function safeRequestJson(req: NextRequest): Promise<CreateSalonBody | null> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === 'object' ? (parsed as CreateSalonBody) : null;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function boundedInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function salonReceipt(row: SalonRow) {
  return {
    id: row.id,
    title: boundedText(row.title, MAX_TITLE_LENGTH) || 'Salon',
    status: boundedText(row.status, 32) || 'recruiting',
  };
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const member = auth.member as GuideMember;
  if (!member.is_guide) return privateJson({ error: 'Must be a Guide' }, { status: 403 });

  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const title = boundedText(body.title, MAX_TITLE_LENGTH) || '';
  if (!title) return privateJson({ error: 'Title required' }, { status: 400 });

  const description = boundedText(body.description, MAX_DESCRIPTION_LENGTH);
  const requestedCommunityId = hasText(body.community_id) ? normalizeUuid(body.community_id) : null;
  if (hasText(body.community_id) && !requestedCommunityId) {
    return privateJson({ error: 'Invalid community_id' }, { status: 400 });
  }

  const parentSalonId = hasText(body.parent_salon_id) ? normalizeUuid(body.parent_salon_id) : null;
  if (hasText(body.parent_salon_id) && !parentSalonId) {
    return privateJson({ error: 'Invalid parent_salon_id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let communityId = requestedCommunityId;

  if (parentSalonId) {
    const { data: parentSalon, error: parentSalonError } = await supabase
      .from('salons')
      .select(PARENT_SALON_SELECT)
      .eq('id', parentSalonId)
      .eq('guide_member_id', auth.memberId)
      .single();

    if (parentSalonError || !parentSalon) return privateJson({ error: 'Invalid parent salon' }, { status: 403 });

    const parentSalonRow = parentSalon as ParentSalonRow;
    if (parentSalonRow.status !== 'completed') {
      return privateJson({ error: 'Parent salon must be completed' }, { status: 400 });
    }
    communityId = typeof parentSalonRow.community_id === 'string' ? parentSalonRow.community_id : communityId;
  }

  const { data: salon, error } = await supabase.from('salons').insert({
    title,
    description: description || null,
    community_id: communityId,
    guide_member_id: auth.memberId,
    parent_salon_id: parentSalonId,
  }).select(SALON_CREATE_RECEIPT_SELECT).single();

  if (error || !salon) return privateJson({ error: 'Failed to create salon' }, { status: 500 });
  const salonRow = salon as SalonRow;

  // Add guide as member
  const { error: memberInsertError } = await supabase
    .from('salon_members')
    .insert({ salon_id: salonRow.id, member_id: auth.memberId, role: 'guide' });

  if (memberInsertError) return privateJson({ error: 'Failed to attach guide to salon' }, { status: 500 });

  // Generate sessions
  const dates = generateSessionSchedule(new Date(), 7);
  const sessions = dates.map((d, i) => ({
    salon_id: salonRow.id,
    session_date: d.toISOString().slice(0, 10),
    session_number: i + 1,
    track: TRACKS[Math.floor(i / 5) % TRACKS.length],
    topic: `${TRACKS[Math.floor(i / 5) % TRACKS.length]} — Session ${(i % 5) + 1}`,
    led_by_member_id: auth.memberId,
  }));
  const { error: sessionsError } = await supabase.from('salon_sessions').insert(sessions);

  if (sessionsError) return privateJson({ error: 'Failed to create salon sessions' }, { status: 500 });

  // Increment salons_led
  const { data: currentMember, error: memberLookupError } = await supabase
    .from('members')
    .select('salons_led')
    .eq('id', auth.memberId)
    .single();

  if (memberLookupError) return privateJson({ error: 'Failed to update guide stats' }, { status: 500 });

  const currentMemberRow = currentMember as MemberSalonCountRow | null;
  const { error: memberUpdateError } = await supabase
    .from('members')
    .update({ salons_led: boundedInteger(currentMemberRow?.salons_led) + 1 })
    .eq('id', auth.memberId);

  if (memberUpdateError) return privateJson({ error: 'Failed to update guide stats' }, { status: 500 });

  emitActivity({
    communityId: communityId || undefined,
    memberId: auth.memberId,
    eventType: 'salon_created',
    title: `Guide ${member.display_name || 'Explorer'} opened: "${title}"`,
    metadata: { salonId: salonRow.id, parentSalonId },
  }).catch(() => {});

  return privateJson({ salon: salonReceipt(salonRow) });
}
