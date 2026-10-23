import { NextRequest } from 'next/server';
import { getSalonStats, checkGraduationEligibility, calculateGuideLevel } from '@/lib/salons';
import { emitActivity } from '@/lib/feed/activityFeed';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const SALON_DETAIL_SELECT = 'id, title, status, week_number, max_members, topic_rotation, description, guide_member_id';
const SALON_MEMBER_SELECT = 'role, sessions_attended, sessions_led, is_guide_candidate, members(display_name)';
const SALON_SESSION_SELECT = 'session_date, session_number, status, track, topic';
const SALON_JOIN_SELECT = 'status, max_members, title, community_id';
const SALON_GUIDE_SELECT = 'guide_member_id';
const SALON_SESSION_ATTEND_SELECT = 'attendance';
const SALON_SESSION_COMPLETE_SELECT = 'led_by_member_id, session_number, status';
const SALON_MEMBER_ATTEND_SELECT = 'sessions_attended';
const SALON_MEMBER_GRADUATION_SELECT = 'id, sessions_led, sessions_attended, absences_unexcused';
const GUIDE_GRADUATION_SELECT = 'members_graduated';
const GUIDE_SELECT = 'display_name, guide_level';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DISPLAY_TEXT = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_GUIDE_LEVEL = 3;
const MAX_ATTENDANCE_RECORDS = 100;
const MAX_GRADUATION_MEMBER_IDS = 50;
const MAX_TRANSCRIPT_SUMMARY_LENGTH = 1500;
const MAX_SESSION_EXP_AWARDED = 500;
const SALON_ACTIONS = new Set(['join', 'attend', 'complete_session', 'graduate']);

type GraduationResult = {
  memberKey: string;
  graduated: boolean;
  reason?: string;
  guide_level?: number;
};

type AuthenticatedMemberContext = NonNullable<Awaited<ReturnType<typeof getAuthenticatedMember>>>;

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

type SalonPostBody = {
  action?: unknown;
  session_id?: unknown;
  transcript_summary?: unknown;
  exp_awarded_total?: unknown;
  member_ids?: unknown;
};

type SalonDetailRow = {
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
  avg_attendance_rate?: unknown;
};

type SalonJoinRow = {
  status?: unknown;
  max_members?: unknown;
  title?: unknown;
  community_id?: unknown;
};

type SalonGuideAccessRow = {
  guide_member_id?: unknown;
};

type SalonSessionAttendanceRow = {
  attendance?: unknown;
};

type SalonSessionCompleteRow = {
  led_by_member_id?: unknown;
  session_number?: unknown;
  status?: unknown;
};

type SalonMemberAttendanceRow = {
  sessions_attended?: unknown;
};

type SalonMemberGraduationRow = {
  id?: unknown;
  sessions_led?: unknown;
  sessions_attended?: unknown;
  absences_unexcused?: unknown;
};

type GuideGraduationRow = {
  members_graduated?: unknown;
};

async function safeRequestJson(req: NextRequest): Promise<SalonPostBody | null> {
  try {
    const value = await req.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as SalonPostBody : null;
  } catch {
    return null;
  }
}

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

function relatedMember(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object' ? first as Record<string, unknown> : null;
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function publicSalon(row: SalonDetailRow) {
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
  const member = relatedMember(row.members);
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
    avg_attendance_rate: boundedInteger(stats.avg_attendance_rate, 100),
  };
}

function normalizedAction(value: unknown) {
  if (typeof value !== 'string') return null;
  const action = value.trim();
  return SALON_ACTIONS.has(action) ? action : null;
}

function normalizedUuid(value: unknown) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return UUID_RE.test(id) ? id : null;
}

function boundedGraduationMemberIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    const id = normalizedUuid(item);
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= MAX_GRADUATION_MEMBER_IDS) break;
  }
  return ids;
}

function boundedAttendanceList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim().slice(0, 80);
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= MAX_ATTENDANCE_RECORDS) break;
  }
  return ids;
}

function publicGraduationResult(index: number, graduated: boolean, reason?: string, guideLevel?: number): GraduationResult {
  return {
    memberKey: `graduation-member-${index + 1}`,
    graduated,
    reason,
    guide_level: guideLevel === undefined ? undefined : boundedInteger(guideLevel, MAX_GUIDE_LEVEL),
  };
}

async function canManageSalon(supabase: SupabaseAdminClient, salonId: string, memberId: string) {
  const { data: salon, error } = await supabase.from('salons').select(SALON_GUIDE_SELECT).eq('id', salonId).single();
  if (error || !salon) return { ok: false, missing: true };

  const row = salon as SalonGuideAccessRow;
  return { ok: row.guide_member_id === memberId, missing: false };
}

async function canManageSalonSession(
  supabase: SupabaseAdminClient,
  salonId: string,
  sessionId: string,
  memberId: string,
) {
  const { data: session, error } = await supabase
    .from('salon_sessions')
    .select(SALON_SESSION_COMPLETE_SELECT)
    .eq('id', sessionId)
    .eq('salon_id', salonId)
    .single();

  if (error || !session) return { ok: false, missing: true, session: null };

  const sessionRow = session as SalonSessionCompleteRow;
  if (sessionRow.led_by_member_id === memberId) return { ok: true, missing: false, session: sessionRow };

  const salonAccess = await canManageSalon(supabase, salonId, memberId);
  return { ok: salonAccess.ok, missing: salonAccess.missing, session: sessionRow };
}

async function handleJoinSalon(supabase: SupabaseAdminClient, salonId: string, auth: AuthenticatedMemberContext) {
  const { data: salon, error: salonError } = await supabase.from('salons').select(SALON_JOIN_SELECT).eq('id', salonId).single();
  if (salonError || !salon) return privateJson({ error: 'Salon not accepting members' }, { status: 400 });

  const salonRow = salon as SalonJoinRow;
  const status = publicText(salonRow.status, '', 32);
  const maxMembers = boundedInteger(salonRow.max_members, 20);
  if (!['recruiting', 'active'].includes(status)) return privateJson({ error: 'Salon not accepting members' }, { status: 400 });

  const { count, error: countError } = await supabase
    .from('salon_members')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId);
  if (countError) return privateJson({ error: 'Failed to join salon' }, { status: 500 });
  if ((count || 0) >= maxMembers) return privateJson({ error: 'Salon full' }, { status: 400 });

  const { data: existing, error: existingError } = await supabase
    .from('salon_members')
    .select('id')
    .eq('salon_id', salonId)
    .eq('member_id', auth.memberId)
    .limit(1);
  if (existingError) return privateJson({ error: 'Failed to join salon' }, { status: 500 });
  if ((existing || []).length > 0) return privateJson({ error: 'Already a member' }, { status: 400 });

  const { error: insertError } = await supabase
    .from('salon_members')
    .insert({ salon_id: salonId, member_id: auth.memberId, role: 'member' });
  if (insertError) return privateJson({ error: 'Failed to join salon' }, { status: 500 });

  if ((count || 0) + 1 >= maxMembers) {
    const { error: statusError } = await supabase
      .from('salons')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', salonId);
    if (statusError) return privateJson({ error: 'Failed to update salon' }, { status: 500 });
  }

  const title = publicText(salonRow.title, 'Salon');
  emitActivity({
    communityId: typeof salonRow.community_id === 'string' ? salonRow.community_id : undefined,
    memberId: auth.memberId,
    eventType: 'member_joined',
    title: `${auth.member.display_name} joined ${title}`,
    metadata: { salonId },
  }).catch(() => {});

  return privateJson({ success: true });
}

async function handleAttendSalonSession(
  supabase: SupabaseAdminClient,
  salonId: string,
  auth: AuthenticatedMemberContext,
  body: SalonPostBody,
) {
  const sessionId = normalizedUuid(body.session_id);
  if (!sessionId) return privateJson({ error: 'session_id required' }, { status: 400 });

  const { data: membership, error: membershipError } = await supabase
    .from('salon_members')
    .select(SALON_MEMBER_ATTEND_SELECT)
    .eq('salon_id', salonId)
    .eq('member_id', auth.memberId)
    .single();
  if (membershipError || !membership) return privateJson({ error: 'Forbidden' }, { status: 403 });

  const { data: session, error: sessionError } = await supabase
    .from('salon_sessions')
    .select(SALON_SESSION_ATTEND_SELECT)
    .eq('id', sessionId)
    .eq('salon_id', salonId)
    .single();
  if (sessionError || !session) return privateJson({ error: 'Not found' }, { status: 404 });

  const attendance = boundedAttendanceList((session as SalonSessionAttendanceRow).attendance);
  if (!attendance.includes(auth.memberId)) {
    const nextAttendance = [...attendance, auth.memberId].slice(0, MAX_ATTENDANCE_RECORDS);
    const { error: attendanceError } = await supabase
      .from('salon_sessions')
      .update({ attendance: nextAttendance })
      .eq('id', sessionId)
      .eq('salon_id', salonId);
    if (attendanceError) return privateJson({ error: 'Failed to record attendance' }, { status: 500 });

    const membershipRow = membership as SalonMemberAttendanceRow;
    const { error: memberUpdateError } = await supabase
      .from('salon_members')
      .update({ sessions_attended: boundedInteger(membershipRow.sessions_attended, 1000) + 1 })
      .eq('salon_id', salonId)
      .eq('member_id', auth.memberId);
    if (memberUpdateError) return privateJson({ error: 'Failed to update attendance count' }, { status: 500 });
  }

  return privateJson({ success: true });
}

async function handleCompleteSalonSession(
  supabase: SupabaseAdminClient,
  salonId: string,
  auth: AuthenticatedMemberContext,
  body: SalonPostBody,
) {
  const sessionId = normalizedUuid(body.session_id);
  if (!sessionId) return privateJson({ error: 'session_id required' }, { status: 400 });

  const access = await canManageSalonSession(supabase, salonId, sessionId, auth.memberId);
  if (access.missing) return privateJson({ error: 'Not found' }, { status: 404 });
  if (!access.ok || !access.session) return privateJson({ error: 'Forbidden' }, { status: 403 });

  const transcriptSummary = nullableText(body.transcript_summary, MAX_TRANSCRIPT_SUMMARY_LENGTH);
  const expAwardedTotal = boundedInteger(body.exp_awarded_total, MAX_SESSION_EXP_AWARDED);
  const wasCompleted = publicText(access.session.status, '', 32) === 'completed';

  const { error: sessionUpdateError } = await supabase
    .from('salon_sessions')
    .update({
      status: 'completed',
      transcript_summary: transcriptSummary,
      exp_awarded_total: expAwardedTotal,
    })
    .eq('id', sessionId)
    .eq('salon_id', salonId);
  if (sessionUpdateError) return privateJson({ error: 'Failed to complete salon session' }, { status: 500 });

  if (!wasCompleted && access.session.led_by_member_id === auth.memberId) {
    const { data: membership, error: membershipError } = await supabase
      .from('salon_members')
      .select('sessions_led')
      .eq('salon_id', salonId)
      .eq('member_id', auth.memberId)
      .single();
    if (membershipError || !membership) return privateJson({ error: 'Failed to update guide progress' }, { status: 500 });

    const membershipRow = membership as { sessions_led?: unknown };
    const { error: memberUpdateError } = await supabase
      .from('salon_members')
      .update({ sessions_led: boundedInteger(membershipRow.sessions_led, 1000) + 1 })
      .eq('salon_id', salonId)
      .eq('member_id', auth.memberId);
    if (memberUpdateError) return privateJson({ error: 'Failed to update guide progress' }, { status: 500 });
  }

  const sessionNumber = boundedInteger(access.session.session_number, 100);
  const weekNum = sessionNumber > 0 ? Math.ceil(sessionNumber / 5) : 1;
  const { error: salonUpdateError } = await supabase
    .from('salons')
    .update({ week_number: weekNum, updated_at: new Date().toISOString() })
    .eq('id', salonId);
  if (salonUpdateError) return privateJson({ error: 'Failed to update salon week' }, { status: 500 });

  return privateJson({ success: true });
}

async function handleGraduateSalonMembers(
  supabase: SupabaseAdminClient,
  salonId: string,
  auth: AuthenticatedMemberContext,
  body: SalonPostBody,
) {
  const guideAccess = await canManageSalon(supabase, salonId, auth.memberId);
  if (guideAccess.missing) return privateJson({ error: 'Not found' }, { status: 404 });
  if (!guideAccess.ok) return privateJson({ error: 'Forbidden' }, { status: 403 });

  const memberIds = boundedGraduationMemberIds(body.member_ids);
  if (!memberIds.length) return privateJson({ error: 'No members specified' }, { status: 400 });

  const { data: salon, error: salonError } = await supabase.from('salons').select('title, community_id').eq('id', salonId).single();
  if (salonError || !salon) return privateJson({ error: 'Not found' }, { status: 404 });

  const { count: totalSessions, error: totalSessionsError } = await supabase
    .from('salon_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId);
  if (totalSessionsError) return privateJson({ error: 'Failed to graduate members' }, { status: 500 });

  const salonRow = salon as { title?: unknown; community_id?: unknown };
  const results: GraduationResult[] = [];
  for (const [index, memberId] of memberIds.entries()) {
    const { data: membership, error: membershipError } = await supabase
      .from('salon_members')
      .select(SALON_MEMBER_GRADUATION_SELECT)
      .eq('salon_id', salonId)
      .eq('member_id', memberId)
      .single();
    if (membershipError || !membership) {
      results.push(publicGraduationResult(index, false, 'Not found'));
      continue;
    }

    const membershipRow = membership as SalonMemberGraduationRow;
    const eligibility = checkGraduationEligibility(
      boundedInteger(membershipRow.sessions_led, 1000),
      boundedInteger(membershipRow.sessions_attended, 1000),
      totalSessions || 35,
      boundedInteger(membershipRow.absences_unexcused, 1000),
    );

    if (!eligibility.eligible) {
      results.push(publicGraduationResult(index, false, eligibility.reason));
      continue;
    }

    const membershipId = normalizedUuid(membershipRow.id);
    if (!membershipId) {
      results.push(publicGraduationResult(index, false, 'Invalid membership'));
      continue;
    }

    const { error: graduationError } = await supabase
      .from('salon_members')
      .update({ role: 'graduating', graduated_at: new Date().toISOString() })
      .eq('id', membershipId)
      .eq('salon_id', salonId);
    if (graduationError) {
      results.push(publicGraduationResult(index, false, 'Graduation update failed'));
      continue;
    }

    const { count: completedSalons, error: completedError } = await supabase
      .from('salon_members')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .eq('role', 'graduating');
    if (completedError) {
      results.push(publicGraduationResult(index, false, 'Guide level update failed'));
      continue;
    }

    const level = calculateGuideLevel(completedSalons || 1);
    const { error: promoteError } = await supabase
      .from('members')
      .update({ is_guide: true, guide_since: new Date().toISOString(), guide_level: level })
      .eq('id', memberId);
    if (promoteError) {
      results.push(publicGraduationResult(index, false, 'Guide level update failed'));
      continue;
    }

    const { data: guideMember, error: guideLookupError } = await supabase
      .from('members')
      .select(GUIDE_GRADUATION_SELECT)
      .eq('id', auth.memberId)
      .single();
    if (guideLookupError || !guideMember) {
      results.push(publicGraduationResult(index, false, 'Guide stats update failed'));
      continue;
    }

    const guideRow = guideMember as GuideGraduationRow;
    const { error: guideUpdateError } = await supabase
      .from('members')
      .update({ members_graduated: boundedInteger(guideRow.members_graduated, 10000) + 1 })
      .eq('id', auth.memberId);
    if (guideUpdateError) {
      results.push(publicGraduationResult(index, false, 'Guide stats update failed'));
      continue;
    }

    emitActivity({
      communityId: typeof salonRow.community_id === 'string' ? salonRow.community_id : undefined,
      memberId,
      eventType: 'member_joined',
      title: `Graduated from ${publicText(salonRow.title, 'Salon')}!`,
      metadata: { salonId, guide_level: level },
    }).catch(() => {});

    results.push(publicGraduationResult(index, true, undefined, level));
  }

  const { data: remaining, error: remainingError } = await supabase
    .from('salon_members')
    .select('id')
    .eq('salon_id', salonId)
    .eq('role', 'member');
  if (remainingError) return privateJson({ error: 'Failed to update salon completion' }, { status: 500 });

  if (!remaining || remaining.length === 0) {
    const { error: completeError } = await supabase
      .from('salons')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', salonId);
    if (completeError) return privateJson({ error: 'Failed to update salon completion' }, { status: 500 });
  }

  return privateJson({ results });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params;
  const supabase = getSupabaseAdmin();
  const { data: salon, error: salonError } = await supabase.from('salons').select(SALON_DETAIL_SELECT).eq('id', salonId).single();
  if (salonError || !salon) return privateJson({ error: 'Not found' }, { status: 404 });

  const salonRow = salon as SalonDetailRow;
  const { data: members, error: membersError } = await supabase.from('salon_members')
    .select(SALON_MEMBER_SELECT).eq('salon_id', salonId);
  if (membersError) return privateJson({ error: 'Failed to load salon members' }, { status: 500 });

  const { data: sessions, error: sessionsError } = await supabase.from('salon_sessions')
    .select(SALON_SESSION_SELECT).eq('salon_id', salonId).order('session_date', { ascending: true });
  if (sessionsError) return privateJson({ error: 'Failed to load salon sessions' }, { status: 500 });

  const stats = await getSalonStats(salonId);

  let guide: GuideRow | null = null;
  if (typeof salonRow.guide_member_id === 'string') {
    const { data: g } = await supabase.from('members').select(GUIDE_SELECT).eq('id', salonRow.guide_member_id).single();
    guide = g;
  }

  return privateJson({
    salon: publicSalon(salonRow),
    members: ((members || []) as SalonMemberRow[]).map(publicSalonMember),
    sessions: ((sessions || []) as SalonSessionRow[]).map(publicSalonSession),
    stats: publicSalonStats(stats),
    guide: publicGuide(guide),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params;
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const body = await safeRequestJson(req);
  const action = normalizedAction(body?.action);
  if (!body || !action) return privateJson({ error: 'Unknown action' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (action === 'join') return handleJoinSalon(supabase, salonId, auth);
  if (action === 'attend') return handleAttendSalonSession(supabase, salonId, auth, body);
  if (action === 'complete_session') return handleCompleteSalonSession(supabase, salonId, auth, body);
  if (action === 'graduate') return handleGraduateSalonMembers(supabase, salonId, auth, body);

  return privateJson({ error: 'Unknown action' }, { status: 400 });
}
