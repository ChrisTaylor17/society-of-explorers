import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSalonStats } from '@/lib/salons';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MY_SALON_SELECT = 'salon_id, role, sessions_attended, sessions_led, is_guide_candidate, salons(id, title, status, week_number, max_members, topic_rotation, description, guide_member_id)';
const SALON_MEMBER_SELECT = 'role, sessions_attended, sessions_led, is_guide_candidate, members(display_name)';
const SALON_SESSION_SELECT = 'session_date, session_number, status, track, topic';
const GUIDE_SELECT = 'display_name, guide_level';
const ACTIVE_SALON_STATUSES = ['recruiting', 'active', 'graduating'];
const MAX_DISPLAY_TEXT = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_GUIDE_LEVEL = 3;

type MySalonMembershipRow = {
  salon_id?: unknown;
  role?: unknown;
  sessions_attended?: unknown;
  sessions_led?: unknown;
  is_guide_candidate?: unknown;
  salons?: unknown;
};

type SalonRow = {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  week_number?: unknown;
  max_members?: unknown;
  topic_rotation?: unknown;
  description?: unknown;
  guide_member_id?: unknown;
};

type SalonMemberRow = {
  role?: unknown;
  sessions_attended?: unknown;
  sessions_led?: unknown;
  is_guide_candidate?: unknown;
  members?: unknown;
};

type SalonSessionRow = {
  session_date?: unknown;
  session_number?: unknown;
  status?: unknown;
  track?: unknown;
  topic?: unknown;
};

type GuideRow = {
  display_name?: unknown;
  guide_level?: unknown;
};

type SalonStatsRow = {
  member_count?: unknown;
  sessions_completed?: unknown;
  sessions_remaining?: unknown;
  current_week?: unknown;
  next_session?: unknown;
};

function boundedInteger(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(0, Math.trunc(value)), max) : 0;
}

function publicText(value: unknown, fallback: string, maxLength = MAX_DISPLAY_TEXT) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function nullableText(value: unknown, maxLength = MAX_DISPLAY_TEXT) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function publicStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 12);
}

function relatedRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object' ? first as Record<string, unknown> : null;
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function publicSalon(row: SalonRow) {
  return {
    id: publicText(row.id, 'salon', 80),
    title: publicText(row.title, 'Salon'),
    status: publicText(row.status, 'recruiting', 32),
    week_number: boundedInteger(row.week_number, 7) || 1,
    max_members: boundedInteger(row.max_members, 20),
    topic_rotation: publicStringList(row.topic_rotation),
    description: nullableText(row.description, MAX_DESCRIPTION_LENGTH),
  };
}

function publicSalonMember(row: SalonMemberRow, index: number) {
  const member = relatedRow(row.members);
  return {
    id: `salon-member-${index + 1}`,
    role: publicText(row.role, 'member', 32),
    sessions_attended: boundedInteger(row.sessions_attended),
    sessions_led: boundedInteger(row.sessions_led),
    is_guide_candidate: row.is_guide_candidate === true,
    members: {
      display_name: publicText(member?.display_name, 'Explorer'),
    },
  };
}

function publicSalonSession(row: SalonSessionRow, index: number) {
  return {
    id: `salon-session-${index + 1}`,
    session_date: publicText(row.session_date, '', 20),
    session_number: boundedInteger(row.session_number, 100),
    status: publicText(row.status, 'scheduled', 32),
    track: nullableText(row.track, 40),
    topic: nullableText(row.topic),
  };
}

function publicGuide(row: GuideRow | null) {
  if (!row) return null;
  return {
    display_name: publicText(row.display_name, 'Guide'),
    guide_level: boundedInteger(row.guide_level, MAX_GUIDE_LEVEL),
  };
}

function publicSalonStats(stats: SalonStatsRow) {
  return {
    member_count: boundedInteger(stats.member_count),
    sessions_completed: boundedInteger(stats.sessions_completed),
    sessions_remaining: boundedInteger(stats.sessions_remaining),
    current_week: boundedInteger(stats.current_week, 7) || 1,
    next_session: nullableText(stats.next_session, 20),
  };
}

function publicMyMembership(row: MySalonMembershipRow) {
  return {
    role: publicText(row.role, 'member', 32),
    sessions_attended: boundedInteger(row.sessions_attended),
    sessions_led: boundedInteger(row.sessions_led),
    is_guide_candidate: row.is_guide_candidate === true,
  };
}

function emptyMySalonResponse() {
  return privateJson({
    salon: null,
    members: [],
    sessions: [],
    stats: null,
    guide: null,
    myMembership: null,
  });
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: memberships, error: membershipError } = await supabase
    .from('salon_members')
    .select(MY_SALON_SELECT)
    .eq('member_id', auth.memberId)
    .in('salons.status', ACTIVE_SALON_STATUSES)
    .limit(1);

  if (membershipError) return privateJson({ error: 'Failed to load my salon' }, { status: 500 });

  const membership = ((memberships || []) as MySalonMembershipRow[]).find((row) => relatedRow(row.salons));
  if (!membership) return emptyMySalonResponse();

  const salon = relatedRow(membership.salons) as SalonRow | null;
  const salonId = typeof salon?.id === 'string' ? salon.id : null;
  if (!salon || !salonId) return emptyMySalonResponse();

  const { data: members, error: membersError } = await supabase
    .from('salon_members')
    .select(SALON_MEMBER_SELECT)
    .eq('salon_id', salonId);
  if (membersError) return privateJson({ error: 'Failed to load salon members' }, { status: 500 });

  const { data: sessions, error: sessionsError } = await supabase
    .from('salon_sessions')
    .select(SALON_SESSION_SELECT)
    .eq('salon_id', salonId)
    .order('session_date', { ascending: true });
  if (sessionsError) return privateJson({ error: 'Failed to load salon sessions' }, { status: 500 });

  const stats = await getSalonStats(salonId);

  let guide: GuideRow | null = null;
  if (typeof salon.guide_member_id === 'string') {
    const { data: guideRow } = await supabase.from('members').select(GUIDE_SELECT).eq('id', salon.guide_member_id).single();
    guide = guideRow as GuideRow | null;
  }

  return privateJson({
    salon: publicSalon(salon),
    members: ((members || []) as SalonMemberRow[]).map(publicSalonMember),
    sessions: ((sessions || []) as SalonSessionRow[]).map(publicSalonSession),
    stats: publicSalonStats(stats),
    guide: publicGuide(guide),
    myMembership: publicMyMembership(membership),
  });
}
