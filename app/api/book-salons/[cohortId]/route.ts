import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { UUID_PATTERN as SHARED_UUID_PATTERN } from '@/lib/ids/uuid';
import { CIRCLE_BOOK_ID } from '@/lib/circles/path';
import { loadCircle } from '@/lib/circles/server';
import { rateLimit } from '@/lib/rateLimit';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';

const UUID_RE = SHARED_UUID_PATTERN;

type SeminarMessageRow = {
  id: string;
  member_id: string | null;
  member_name: string | null;
  content: string;
  created_at: string;
};

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

const plainText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const messageId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(value);
const timestamp = (value: unknown): value is string => plainText(value, 64) && Number.isFinite(Date.parse(value));
const tombstones = { hidden: '[Post hidden after human review.]', withdrawn: '[Post withdrawn by its author.]' } as const;

function circleMessage(value: unknown, own = false) {
  if (!isRecord(value) || !messageId(value.id) || !plainText(value.member_name, 200) || !timestamp(value.created_at)
    || typeof value.is_mine !== 'boolean' || (own && value.is_mine !== true)
    || !['visible', 'hidden', 'withdrawn'].includes(String(value.visibility))) return null;
  const visibility = value.visibility as 'visible' | 'hidden' | 'withdrawn';
  if (own && visibility !== 'visible') return null;
  if (visibility === 'visible' && !plainText(value.content, 2000)) return null;
  // A withheld row never sends raw text, including to its author. Reconstruct
  // the fixed public tombstone even if an RPC accidentally includes more data.
  return { id: value.id, member_name: value.member_name.includes('@') ? 'Explorer' : value.member_name,
    content: visibility === 'visible' ? value.content as string : tombstones[visibility],
    created_at: value.created_at, is_mine: value.is_mine, visibility };
}

function circleRead(value: unknown, circleId: string) {
  if (!isRecord(value) || !isRecord(value.cohort) || value.cohort.id !== circleId || value.cohort.book_id !== CIRCLE_BOOK_ID
    || !plainText(value.cohort.title, 200) || !Array.isArray(value.members) || value.members.length > 1000
    || !Array.isArray(value.messages) || value.messages.length > 100 || !isRecord(value.history)
    || value.history.limit !== 100 || typeof value.history.truncated !== 'boolean'
    || (value.history.truncated && value.messages.length !== 100)) return null;
  const c = value.cohort;
  if ((c.description !== null && !plainText(c.description, 2000))
    || (c.max_members !== null && (!Number.isSafeInteger(c.max_members) || Number(c.max_members) < 1))
    || (c.start_date !== null && !plainText(c.start_date, 64)) || (c.thinker_id !== null && !plainText(c.thinker_id, 100))
    || (c.status !== null && !plainText(c.status, 40)) || (c.created_at !== null && !timestamp(c.created_at))) return null;
  const members = [];
  const memberIds = new Set<string>();
  for (const member of value.members) {
    if (!isRecord(member) || !messageId(member.id) || memberIds.has(member.id) || !isRecord(member.members)
      || (member.members.display_name !== null && !plainText(member.members.display_name, 200))) return null;
    memberIds.add(member.id);
    const name = member.members.display_name;
    members.push({ id: member.id, members: { display_name: typeof name === 'string' && !name.includes('@') ? name : 'Explorer' } });
  }
  const messages = [];
  const messageIds = new Set<string>();
  for (const row of value.messages) {
    const message = circleMessage(row);
    if (!message || messageIds.has(message.id)) return null;
    messageIds.add(message.id); messages.push(message);
  }
  return { cohort: { id: circleId, book_id: CIRCLE_BOOK_ID, title: c.title, description: c.description,
    max_members: c.max_members, start_date: c.start_date, thinker_id: c.thinker_id, status: c.status, created_at: c.created_at },
  members, messages, history: { limit: 100, truncated: value.history.truncated } };
}

function rpcStatus(error: unknown): number {
  const code = isRecord(error) ? error.code : null;
  return code === 'PT400' ? 400 : code === 'PT403' ? 403 : code === 'PT404' ? 404 : code === 'PT409' ? 409 : 503;
}

async function readConversation(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  const { cohortId } = await params;
  if (!UUID_RE.test(cohortId)) return privateJson({ error: 'Invalid cohort id' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  const supabaseAdmin = getSupabaseAdmin();

  const cohortRes = await supabaseAdmin
      .from('book_cohorts')
      .select('id,book_id,title,description,max_members,start_date,thinker_id,status,created_at')
      .eq('id', cohortId)
      .single();
  if (cohortRes.error) return privateJson({ error: 'Circle or salon unavailable' }, { status: 503 });
  if (!cohortRes.data) return privateJson({ error: 'Not found' }, { status: 404 });
  if (!isRecord(cohortRes.data) || cohortRes.data.id !== cohortId || typeof cohortRes.data.book_id !== 'string') {
    return privateJson({ error: 'Circle or salon unavailable' }, { status: 503 });
  }

  // Circles link to this legacy reader. Their discussion is a member surface;
  // ordinary book salons retain their existing public-read policy.
  const isCircle = cohortRes.data.book_id === CIRCLE_BOOK_ID;
  if (isCircle) {
    if (!auth) return privateJson({ error: 'Sign in to read this circle' }, { status: 401 });
    // One service-only transaction checks current membership and projects the
    // visibility state under the same locks. Missing safety SQL fails closed.
    const result = await supabaseAdmin.rpc('soe_circle_messages_read', { p_actor: auth.memberId, p_circle_id: cohortId });
    if (result.error) return privateJson({ error: 'Circle discussion unavailable' }, { status: rpcStatus(result.error) });
    const projected = circleRead(result.data, cohortId);
    if (!projected) return privateJson({ error: 'Circle discussion unavailable' }, { status: 503 });
    return privateJson(projected);
  }

  const [membersRes, messagesRes] = await Promise.all([
    supabaseAdmin.from('book_cohort_members').select('id, members(display_name)').eq('cohort_id', cohortId),
    supabaseAdmin
      .from('seminar_messages')
      .select('id,member_id,member_name,content,created_at')
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: true })
      .limit(100),
  ]);

  if (membersRes.error || messagesRes.error) return privateJson({ error: 'Discussion unavailable' }, { status: 503 });
  const rows = (messagesRes.data || []) as SeminarMessageRow[];
  const messages = rows.map((message) => ({
    id: message.id,
    member_name: message.member_name || 'Explorer',
    content: message.content,
    created_at: message.created_at,
    is_mine: Boolean(auth?.memberId && message.member_id === auth.memberId),
  }));

  return privateJson({
    cohort: cohortRes.data,
    members: membersRes.data || [],
    messages,
  });
}

export async function GET(req: NextRequest, context: { params: Promise<{ cohortId: string }> }) {
  try { return await readConversation(req, context); }
  catch { return privateJson({ error: 'Discussion unavailable' }, { status: 503 }); }
}

// Post a message to the cohort discussion
export async function POST(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  let writeAttempted = false;
  const refused = (error: string, status: number, headers?: HeadersInit) => privateJson({ error, outcome: 'not_attempted' }, { status, headers });
  try {
    const { cohortId } = await params;
    if (!UUID_RE.test(cohortId)) return refused('Invalid cohort id', 400);

    const auth = await getAuthenticatedMember(req);
    if (!auth) return refused('Unauthorized', 401);

    const supabaseAdmin = getSupabaseAdmin();
    const cohort = await supabaseAdmin.from('book_cohorts').select('id,book_id').eq('id', cohortId).maybeSingle();
    if (cohort.error) return refused('Discussion unavailable', 503);
    if (!cohort.data) return refused('Not found', 404);
    if (!isRecord(cohort.data) || cohort.data.id !== cohortId || typeof cohort.data.book_id !== 'string') return refused('Discussion unavailable', 503);
    const isCircle = cohort.data.book_id === CIRCLE_BOOK_ID;
    let parsed: unknown;
    if (isCircle) {
      const originError = circleWriteOrigin(req);
      if (originError) return refused('Use this site to submit the request.', originError.status);
      const read = await readCircleReviewJson(req);
      if (!read.ok) return refused(read.response.status === 413 ? 'Use a smaller request.' : 'Use a valid JSON request.', read.response.status);
      parsed = read.value;
    } else parsed = await safeRequestJson(req);
    const content = isRecord(parsed) ? boundedText(parsed.content, 2_000) : null;
    if (!content) return refused('Empty message', 400);
    if (isCircle && (!isRecord(parsed) || typeof parsed.content !== 'string' || parsed.content.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(parsed.content))) {
      return refused('Use plain text up to 2,000 characters', 400);
    }
    if (isCircle && !(await loadCircle(supabaseAdmin, cohortId))) return refused('Circle not found', 404);
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('book_cohort_members')
      .select('id')
      .eq('cohort_id', cohortId)
      .eq('member_id', auth.memberId)
      .maybeSingle();

    if (membershipError) return refused('Membership unavailable', 503);
    if (!membership || typeof membership.id !== 'string') return refused('Join this book salon before posting', 403);
    if (isCircle) {
      const budget = rateLimit(`circle-message:${auth.memberId}`, 12, 60000);
      if (!budget.ok) return refused('Posting is temporarily limited', 429, { 'Retry-After': String(budget.retryAfterS) });
      const [currentAuth, currentMembership, circle] = await Promise.all([
        getAuthenticatedMember(req),
        supabaseAdmin.from('book_cohort_members').select('id').eq('id', membership.id).eq('cohort_id', cohortId).eq('member_id', auth.memberId).maybeSingle(),
        loadCircle(supabaseAdmin, cohortId),
      ]);
      if (currentMembership.error) return refused('Membership unavailable', 503);
      if (currentAuth?.memberId !== auth.memberId || !currentMembership.data || !circle) return refused('Circle access changed. Refresh before posting.', 403);
    }

    const name = auth.member.display_name;
    const memberName = typeof name === 'string' && name.trim() && !name.includes('@') ? name.trim().slice(0, 200) : 'Explorer';
    const payload = {
      cohort_id: cohortId,
      member_id: auth.memberId,
      member_name: auth.member.display_name || 'Explorer',
      content,
    };
    if (isCircle) payload.member_name = memberName;
    writeAttempted = true;
    if (isCircle) {
      const result = await supabaseAdmin.rpc('soe_circle_messages_post', { p_actor: auth.memberId, p_circle_id: cohortId,
        p_content: content, p_member_name: memberName });
      if (result.error) {
        const status = rpcStatus(result.error);
        const code = isRecord(result.error) ? result.error.code : null;
        const refusedByDatabase = status !== 503 || ['PGRST202', '42883', '42P01'].includes(String(code));
        return privateJson({ error: 'Message save could not be confirmed', outcome: refusedByDatabase ? 'not_attempted' : 'unknown' }, { status });
      }
      const receipt = result.data;
      const message = isRecord(receipt) ? circleMessage(receipt.message, true) : null;
      if (!isRecord(receipt) || receipt.outcome !== 'confirmed' || receipt.circleId !== cohortId || !message || message.content !== content) {
        return privateJson({ error: 'Message save could not be confirmed', outcome: 'unknown' }, { status: 503 });
      }
      return privateJson({ outcome: 'confirmed', circleId: cohortId, message });
    }
    const { data, error } = await supabaseAdmin.from('seminar_messages').insert(payload).select().single();

    if (error || !data || data.cohort_id !== cohortId || data.member_id !== auth.memberId || data.content !== content || typeof data.id !== 'string' || typeof data.created_at !== 'string') {
      return privateJson({ error: 'Message save could not be confirmed', outcome: 'unknown' }, { status: 503 });
    }
    return privateJson({
      ...(isCircle ? { outcome: 'confirmed', circleId: cohortId } : {}),
      message: {
        id: data.id,
        member_name: data.member_name || 'Explorer',
        content: data.content,
        created_at: data.created_at,
        is_mine: true,
      },
    });
  } catch {
    return privateJson({ error: 'Message save could not be confirmed', outcome: writeAttempted ? 'unknown' : 'not_attempted' }, { status: 503 });
  }
}
