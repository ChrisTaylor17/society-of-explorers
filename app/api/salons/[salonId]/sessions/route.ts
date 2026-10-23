import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TOPIC_LENGTH = 140;
const MAX_SUMMARY_LENGTH = 1500;
const MAX_EXP_AWARDED = 500;
const SESSION_STATUSES = new Set(['scheduled', 'live', 'completed', 'cancelled']);
const SESSION_TRACKS = new Set(['singularity', 'blockchain', 'consciousness']);
const SALON_SESSION_PUBLIC_SELECT = 'session_date, session_number, status, track, topic';
const SALON_SESSION_MUTATION_SELECT = 'id, session_date, session_number, status, track, topic';
const SALON_SESSION_ACCESS_SELECT = 'id, led_by_member_id';
const SALON_GUIDE_SELECT = 'guide_member_id';

type SessionRouteContext = {
  params: Promise<{ salonId: string }>;
};

type SessionBody = {
  session_id?: unknown;
  session_date?: unknown;
  session_number?: unknown;
  topic?: unknown;
  track?: unknown;
  status?: unknown;
  transcript_summary?: unknown;
  exp_awarded_total?: unknown;
};

type SalonSessionRow = {
  id?: unknown;
  session_date?: unknown;
  session_number?: unknown;
  status?: unknown;
  track?: unknown;
  topic?: unknown;
};

type SalonSessionAccessRow = {
  id?: unknown;
  led_by_member_id?: unknown;
};

type SalonGuideRow = {
  guide_member_id?: unknown;
};

type SalonSessionUpdate = {
  status?: string;
  transcript_summary?: string | null;
  exp_awarded_total?: number;
  updated_at: string;
};

async function safeRequestJson(req: NextRequest): Promise<SessionBody | null> {
  try {
    const value = await req.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as SessionBody : null;
  } catch {
    return null;
  }
}

function publicText(value: unknown, fallback: string, maxLength = MAX_TOPIC_LENGTH) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function nullableText(value: unknown, maxLength = MAX_TOPIC_LENGTH) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

function boundedInteger(value: unknown, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(0, Math.trunc(value)), max) : 0;
}

function normalizedStatus(value: unknown) {
  if (typeof value !== 'string') return null;
  const status = value.trim().toLowerCase();
  return SESSION_STATUSES.has(status) ? status : null;
}

function normalizedTrack(value: unknown) {
  if (typeof value !== 'string') return null;
  const track = value.trim().toLowerCase();
  return SESSION_TRACKS.has(track) ? track : null;
}

function normalizedDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizedSessionId(value: unknown) {
  if (typeof value !== 'string') return null;
  const sessionId = value.trim();
  return UUID_RE.test(sessionId) ? sessionId : null;
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

function privateSalonSessionReceipt(row: SalonSessionRow) {
  return {
    id: publicText(row.id, 'session', 80),
    session_date: publicText(row.session_date, '', 20),
    session_number: boundedInteger(row.session_number, 100),
    status: publicText(row.status, 'scheduled', 32),
    track: nullableText(row.track, 40),
    topic: nullableText(row.topic),
  };
}

async function canManageSalon(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  salonId: string,
  memberId: string,
) {
  const { data: salon, error: salonError } = await supabase
    .from('salons')
    .select(SALON_GUIDE_SELECT)
    .eq('id', salonId)
    .single();

  if (salonError || !salon) return { ok: false, missing: true };

  const salonRow = salon as SalonGuideRow;
  return { ok: salonRow.guide_member_id === memberId, missing: false };
}

async function canManageSalonSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  salonId: string,
  sessionId: string,
  memberId: string,
) {
  const { data: session, error: sessionError } = await supabase
    .from('salon_sessions')
    .select(SALON_SESSION_ACCESS_SELECT)
    .eq('id', sessionId)
    .eq('salon_id', salonId)
    .single();

  if (sessionError || !session) return { ok: false, missing: true };

  const sessionRow = session as SalonSessionAccessRow;
  if (sessionRow.led_by_member_id === memberId) return { ok: true, missing: false };

  return canManageSalon(supabase, salonId, memberId);
}

export async function GET(_req: NextRequest, { params }: SessionRouteContext) {
  const { salonId } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('salon_sessions')
    .select(SALON_SESSION_PUBLIC_SELECT)
    .eq('salon_id', salonId)
    .order('session_date', { ascending: true });

  if (error) return privateJson({ error: 'Failed to load salon sessions' }, { status: 500 });

  return privateJson({ sessions: ((data || []) as SalonSessionRow[]).map(publicSalonSession) });
}

export async function POST(req: NextRequest, { params }: SessionRouteContext) {
  const { salonId } = await params;
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const sessionDate = normalizedDate(body.session_date);
  const topic = nullableText(body.topic);
  const track = normalizedTrack(body.track);
  const sessionNumber = boundedInteger(body.session_number, 100);
  if (!sessionDate || !topic || !track) return privateJson({ error: 'Missing fields' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const access = await canManageSalon(supabase, salonId, auth.memberId);
  if (access.missing) return privateJson({ error: 'Not found' }, { status: 404 });
  if (!access.ok) return privateJson({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('salon_sessions')
    .insert({
      salon_id: salonId,
      session_date: sessionDate,
      session_number: sessionNumber || null,
      topic,
      track,
      led_by_member_id: auth.memberId,
    })
    .select(SALON_SESSION_MUTATION_SELECT)
    .single();

  if (error || !data) return privateJson({ error: 'Failed to create salon session' }, { status: 500 });

  return privateJson({ session: privateSalonSessionReceipt(data as SalonSessionRow) });
}

export async function PATCH(req: NextRequest, { params }: SessionRouteContext) {
  const { salonId } = await params;
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const sessionId = normalizedSessionId(body.session_id);
  if (!sessionId) return privateJson({ error: 'session_id required' }, { status: 400 });

  const updates: SalonSessionUpdate = { updated_at: new Date().toISOString() };
  if (body.transcript_summary !== undefined) updates.transcript_summary = nullableText(body.transcript_summary, MAX_SUMMARY_LENGTH);
  if (body.status !== undefined) {
    const status = normalizedStatus(body.status);
    if (!status) return privateJson({ error: 'Invalid status' }, { status: 400 });
    updates.status = status;
  }
  if (body.exp_awarded_total !== undefined) updates.exp_awarded_total = boundedInteger(body.exp_awarded_total, MAX_EXP_AWARDED);

  if (Object.keys(updates).length === 1) return privateJson({ error: 'No updates' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const access = await canManageSalonSession(supabase, salonId, sessionId, auth.memberId);
  if (access.missing) return privateJson({ error: 'Not found' }, { status: 404 });
  if (!access.ok) return privateJson({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('salon_sessions')
    .update(updates)
    .eq('id', sessionId)
    .eq('salon_id', salonId)
    .select(SALON_SESSION_MUTATION_SELECT)
    .single();

  if (error || !data) return privateJson({ error: 'Failed to update salon session' }, { status: 500 });

  return privateJson({ session: privateSalonSessionReceipt(data as SalonSessionRow) });
}
