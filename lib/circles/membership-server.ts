import { hasPublicProfileReference, parsePublicProfileReference } from '@/lib/members/public-reference';
import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { rateLimit } from '@/lib/rateLimit';
import { readCircleReadingEdition } from '@/lib/circles/reading-edition-server';
import { matchesReadingEdition, parseReadingProgram } from './reading-program';
import { circleWriteOrigin, readCircleReviewJson } from './moderation-server';
import { getReading } from './path';
import { CIRCLE_FORMATS, FORMAT_LABELS, TIMEZONES, VENUE_LABELS, VENUE_TYPES, firstMeeting, formatMeeting, pathWeek, type CircleFormat, type VenueType } from './schedule';
import { parseCircleCreateMutation, parseCircleCompleteMutation, parseCircleHostingAccess, parseOwnedCircleCreateReceipt, parseOwnedCircleCompleteReceipt } from './hosting';
import { CIRCLE_MEMBERSHIP_PAGE_SIZE, membershipDay, membershipInteger, membershipRecord, membershipText,
  parseCircleAttendanceMutation, parseCircleAttendanceReceipt, parseCircleCreateReceipt, parseCircleDetail, parseCircleListing, parseCircleManagement, parseCircleMembershipReceipt, parseCircleStart, parseMyCircles,
  type CircleParticipationAction } from './membership';

type Result<T> = { ok: true; value: T } | { ok: false; response: Response };
type RpcArgs = Record<string, unknown>;
const refuse = (message: string, status: number, outcome = 'not_attempted') => privateJson({ error: message, outcome }, { status });
const unavailable = (mutation = false, unknown = false) => privateJson({ error: 'Circle participation is unavailable. Refresh before trying again.',
  ...(mutation ? { outcome: unknown ? 'unknown' : 'not_attempted' } : {}) }, { status: 503 });
const onlyFields = (body: Record<string, unknown>, fields: string[]) => Object.keys(body).every(key => fields.includes(key));

/** An optional reviewed-owner guard closes cookie changes between proof and
 * operation. It never supplies identity or turns a public read into authority. */
function expectedMember(req: NextRequest, actor: string | null): Response | null {
  const expected = req.headers.get('x-soe-expected-member');
  if (expected === null) return null;
  if (!isUuid(expected) || expected !== expected.toLowerCase()) return refuse('Use a valid reviewed account.', 400);
  if (actor === null) return refuse('Sign in to verify the reviewed account.', 401);
  return expected === actor.toLowerCase() ? null : refuse('The account changed. Check current access before reviewing another action.', 409);
}

function failure(error: unknown, mutation: boolean): Response {
  const code = membershipRecord(error) ? error.code : null;
  const status = code === 'PT400' ? 400 : code === 'PT403' ? 403 : code === 'PT404' ? 404 : code === 'PT409' ? 409 : 503;
  if (status === 503) return unavailable(mutation, !['PT503', 'PGRST202', '42883', '42P01', '42501'].includes(String(code)));
  const message = status === 409 ? 'Circle participation changed. Refresh before confirming again.'
    : status === 403 ? 'This action is not available to your account.' : status === 404 ? 'Circle not found.' : 'The request could not be accepted.';
  return privateJson({ error: message, ...(mutation ? { outcome: 'not_attempted' } : {}) }, { status });
}

async function rpc<T>(name: string, args: RpcArgs, parse: (value: unknown) => T | null, mutation = false): Promise<Response> {
  let sent = false;
  try {
    const db = getSupabaseAdmin();
    sent = true;
    const { data, error } = await db.rpc(name, args);
    if (error) return failure(error, mutation);
    const value = parse(data);
    return value === null ? unavailable(mutation, mutation) : privateJson(value);
  } catch { return unavailable(mutation, sent); }
}

/** The read snapshot is produced under one database lock/snapshot. Only these
 * public fields and this caller's flags survive the server-to-client boundary. */
function projectSnapshot(value: unknown, detail: boolean): Record<string, unknown> | null {
  if (!membershipRecord(value) || !membershipRecord(value.circle) || typeof value.ended !== 'boolean'
    || !membershipInteger(value.memberCount, 100_000) || !membershipInteger(value.revision)
    || !(value.hostName === null || membershipText(value.hostName, 200))) return null;
  const c = value.circle;
  if (!Object.hasOwn(c, 'circle_reading_program') || !isUuid(c.id) || !membershipText(c.title, 200) || !c.title.trim()
    || !(c.description === null || membershipText(c.description, 2000))
    || !membershipInteger(c.max_members, 12) || c.max_members < 3
    || !membershipText(c.start_date, 64) || !membershipDay(c.start_date.slice(0, 10)) || !Number.isFinite(Date.parse(c.start_date))
    || !membershipText(c.status, 40) || !['forming', 'active', 'completed'].includes(c.status)
    || !CIRCLE_FORMATS.includes(c.circle_format as CircleFormat) || !membershipInteger(c.circle_weekday, 6)
    || !membershipText(c.circle_time, 5) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.circle_time)
    || typeof c.circle_timezone !== 'string' || !Object.hasOwn(TIMEZONES, c.circle_timezone)
    || !VENUE_TYPES.includes(c.circle_venue_type as VenueType) || typeof c.circle_hidden !== 'boolean'
    || !['circle_city', 'circle_region', 'circle_venue_name'].every(key => c[key] === null || membershipText(c[key], 200))) return null;
  let next: string | null;
  if (detail) {
    if (!Array.isArray(value.meetings) || value.meetings.length > 4) return null;
    const first = value.meetings[0];
    if (first !== undefined && (!membershipRecord(first) || !membershipDay(first.date))) return null;
    next = first === undefined ? null : first.date as string;
  } else {
    if (value.nextMeeting !== null && !membershipDay(value.nextMeeting)) return null;
    next = value.nextMeeting as string | null;
  }
  if ((value.ended && next !== null) || (!value.ended && !c.circle_hidden && next === null)) return null;
  const start = c.start_date.slice(0, 10), weekday = c.circle_weekday;
  const program = c.circle_reading_program === null ? null : parseReadingProgram(c.circle_reading_program);
  if (c.circle_reading_program !== null && !program) return null;
  const programLength = program?.sessions.length ?? 12;
  const week = next ? pathWeek(start, weekday, next) : programLength + 1;
  if (week > programLength + 1 || (next !== null && week > programLength)) return null;
  const reading = program ? undefined : getReading(week);
  const hostName = typeof value.hostName === 'string' ? value.hostName.trim() : '';
  const format = c.circle_format as CircleFormat;
  const circle = { id: c.id, title: c.title, description: c.description, format, format_label: FORMAT_LABELS[format],
    city: c.circle_city, region: c.circle_region, venue_name: format === 'online' ? null : c.circle_venue_name,
    venue_label: VENUE_LABELS[c.circle_venue_type as VenueType], meeting_label: formatMeeting(weekday, c.circle_time, c.circle_timezone),
    weekday, time: c.circle_time, timezone: c.circle_timezone, start_date: start, first_meeting: firstMeeting(start, weekday),
    next_meeting: next, week, reading: reading ? { week: reading.week, title: reading.title, slug: reading.slug, author: reading.author, selection: reading.selection } : null,
    reading_program: program, program_length: programLength,
    member_count: value.memberCount, max_members: c.max_members, spots_left: value.ended ? 0 : Math.max(0, c.max_members - value.memberCount),
    status: c.status, host_name: hostName && !hostName.includes('@') ? hostName.slice(0, 40) : 'An explorer',
    going_next: detail && Array.isArray(value.meetings) && membershipRecord(value.meetings[0]) ? value.meetings[0].going : null,
    hidden: c.circle_hidden, publicProfileId: detail ? parsePublicProfileReference(value.publicProfileId) : null };
  return { circle, revision: value.revision, viewer: value.viewer, ended: value.ended, capabilities: value.capabilities,
    ...(detail ? { ready: true, meetings: value.meetings, online_url: value.ended ? null : value.online_url } : {}) };
}

function projectDetail(value: unknown, circleId: string) {
  if (!hasPublicProfileReference(value)) return null;
  const projected = projectSnapshot(value, true);
  return projected ? parseCircleDetail(projected, circleId) : null;
}

export async function circleListing(circleId: string): Promise<Response> {
  if (!isUuid(circleId)) return refuse('Use a valid Circle identifier.', 400);
  return rpc('soe_circle_detail_profiles', { p_actor: null, p_circle_id: circleId.toLowerCase() }, value => {
    const detail = projectDetail(value, circleId);
    if (!detail || detail.viewer.signed_in || detail.circle.hidden) return null;
    return parseCircleListing(detail.circle, circleId);
  });
}

export async function circleDetail(req: NextRequest, circleId: string): Promise<Response> {
  if (!isUuid(circleId)) return refuse('Use a valid Circle identifier.', 400);
  try {
    const actor = await getAuthenticatedMember(req);
    const mismatch = expectedMember(req, actor?.memberId ?? null);
    if (mismatch) return mismatch;
    return await rpc('soe_circle_detail_profiles', { p_actor: actor?.memberId ?? null, p_circle_id: circleId.toLowerCase() }, value => projectDetail(value, circleId));
  } catch { return unavailable(); }
}

export async function circleStart(req: NextRequest): Promise<Response> {
  try {
    const actor = await getAuthenticatedMember(req);
    if (!actor || !isUuid(actor.memberId)) return refuse('Sign in to check Circle hosting.', 401);
    const mismatch = expectedMember(req, actor.memberId);
    if (mismatch) return mismatch;
    return await rpc('soe_circle_start', { p_actor: actor.memberId }, value => {
      const parsed = parseCircleStart(value);
      return parsed ? parseCircleHostingAccess({ memberId: actor.memberId.toLowerCase(), ...parsed }, actor.memberId.toLowerCase()) : null;
    });
  } catch { return unavailable(); }
}

export async function circleMembership(req: NextRequest, circleId: string): Promise<Response> {
  if (!isUuid(circleId)) return refuse('Use a valid Circle identifier.', 400);
  try {
    const actor = await getAuthenticatedMember(req);
    if (!actor || !isUuid(actor.memberId)) return refuse('Sign in to check Circle membership controls.', 401);
    const mismatch = expectedMember(req, actor.memberId);
    if (mismatch) return mismatch;
    return await rpc('soe_circle_membership_state', { p_actor: actor.memberId, p_circle_id: circleId.toLowerCase() }, value => parseCircleManagement(value, circleId));
  } catch { return unavailable(); }
}

export async function circleMine(req: NextRequest): Promise<Response> {
  const params = (req.nextUrl ?? new URL(req.url)).searchParams;
  const after = params.get('after'), rawLimit = params.get('limit');
  const limit = rawLimit === null ? CIRCLE_MEMBERSHIP_PAGE_SIZE : Number(rawLimit);
  if (params.getAll('after').length > 1 || params.getAll('limit').length > 1 || (after !== null && !isUuid(after))
    || (rawLimit !== null && !/^\d+$/.test(rawLimit)) || !membershipInteger(limit, CIRCLE_MEMBERSHIP_PAGE_SIZE) || limit < 1) return refuse('Use a valid Circle page.', 400);
  try {
    const actor = await getAuthenticatedMember(req);
    if (!actor || !isUuid(actor.memberId)) return refuse('Sign in to view your Circles.', 401);
    return await rpc('soe_circle_my_circles', { p_actor: actor.memberId, p_after: after?.toLowerCase() ?? null, p_limit: limit }, value => {
      if (!membershipRecord(value) || !Array.isArray(value.items) || value.items.length > limit) return null;
      const items = value.items.map(item => {
        if (!membershipRecord(item)) return null;
        if (item.kind === 'management') return parseCircleManagement(item);
        const projected = item.kind === 'circle' ? projectSnapshot(item, false) : null;
        return projected ? { ...projected, kind: 'circle' } : null;
      });
      return parseMyCircles({ items, nextCursor: value.nextCursor }, { after, limit });
    });
  } catch { return unavailable(); }
}

async function mutationInput(req: NextRequest, supplied?: unknown): Promise<Result<Record<string, unknown>>> {
  const origin = circleWriteOrigin(req);
  if (origin) return { ok: false, response: refuse('Use this site to submit the request.', origin.status) };
  const read = supplied === undefined ? await readCircleReviewJson(req) : { ok: true as const, value: supplied };
  if (!read.ok) return { ok: false, response: refuse(read.response.status === 413 ? 'Use a smaller request.' : 'Use a valid JSON request.', read.response.status) };
  if (!membershipRecord(read.value) || !isUuid(read.value.requestId)) return { ok: false, response: refuse('A valid requestId is required. Refresh and confirm this action again.', 400) };
  return { ok: true, value: read.value };
}

export async function circleCreate(req: NextRequest): Promise<Response> {
  const input = await mutationInput(req);
  if (!input.ok) return input.response;
  // Normalize against the supplied date, not today's clock: exact historical
  // retries reach SQL receipt lookup before current creation eligibility.
  const body = parseCircleCreateMutation(input.value);
  if (!body) return refuse('A reviewed account and normalized Circle listing are required.', 400);
  const { expectedMemberId: reviewedMember, requestId, ...listing } = body;
  try {
    const actor = await getAuthenticatedMember(req);
    if (!actor || !isUuid(actor.memberId)) return refuse('Sign in to start a Circle.', 401);
    const mismatch = expectedMember(req, actor.memberId);
    if (mismatch) return mismatch;
    if (reviewedMember !== actor.memberId.toLowerCase()) return refuse('The account changed. Review the Circle with your current account.', 409);
    const budget = rateLimit(`circle-participation:${actor.memberId}`, 120, 60 * 60 * 1000);
    if (!budget.ok) return refuse('Too many requests. Try again later.', 429);
    if (listing.readingProgram) {
      const metadata = await readCircleReadingEdition(listing.readingProgram.bookId);
      if (!metadata || !matchesReadingEdition(metadata, listing.readingProgram)) return refuse('The selected source edition changed. Refresh the reading selection before starting a Circle.', 409);
    }
    return await rpc('soe_circle_create', { p_actor: actor.memberId, p_request_id: requestId, p_input: listing }, value => {
      const parsed = parseCircleCreateReceipt(value, requestId);
      return parsed ? parseOwnedCircleCreateReceipt({ memberId: actor.memberId.toLowerCase(), ...parsed }, requestId, reviewedMember) : null;
    }, true);
  } catch { return unavailable(true); }
}

export async function circleMutation(req: NextRequest, circleId: string, action: Exclude<CircleParticipationAction, 'create'>, supplied?: unknown): Promise<Response> {
  if (!isUuid(circleId)) return refuse('Use a valid Circle identifier.', 400);
  const input = await mutationInput(req, supplied);
  if (!input.ok) return input.response;
  const body = input.value;
  const attendance = action === 'rsvp' ? parseCircleAttendanceMutation(body) : null;
  const completion = action === 'complete' ? parseCircleCompleteMutation(body) : null;
  if (action === 'complete' && !completion) return refuse('A reviewed account and Circle completion are required.', 400);
  if (action === 'rsvp' && !attendance) return refuse('A reviewed account, request and meeting response are required.', 400);
  if (!onlyFields(body, ['requestId', 'expectedRevision', ...(action === 'rsvp' ? ['expectedMemberId', 'date', 'status'] : action === 'complete' ? ['expectedMemberId'] : []), ...(supplied === undefined ? [] : ['cohortId'])])
    || (supplied !== undefined && (typeof body.cohortId !== 'string' || body.cohortId.toLowerCase() !== circleId.toLowerCase()))) return refuse('Use only the supported participation fields.', 400);
  if (!membershipInteger(body.expectedRevision)) return refuse('A current expectedRevision is required. Refresh before confirming.', 400);
  if (action === 'rsvp' && (!membershipDay(body.date) || !['going', 'not_going'].includes(String(body.status)))) return refuse('Use a valid meeting date and RSVP status.', 400);
  try {
    const actor = await getAuthenticatedMember(req);
    if (!actor || !isUuid(actor.memberId)) return refuse('Sign in to change Circle participation.', 401);
    const mismatch = expectedMember(req, actor.memberId);
    if (mismatch) return mismatch;
    if (completion && completion.expectedMemberId !== actor.memberId.toLowerCase()) return refuse('The account changed. Review completion with your current account.', 409);
    if (attendance && attendance.expectedMemberId !== actor.memberId.toLowerCase()) return refuse('The account changed. Check current access before reviewing another RSVP.', 409);
    const budget = rateLimit(`circle-participation:${actor.memberId}`, 120, 60 * 60 * 1000);
    if (!budget.ok) return refuse('Too many requests. Try again later.', 429);
    const requestId = (body.requestId as string).toLowerCase(), id = circleId.toLowerCase();
    return await rpc(`soe_circle_${action}`, { p_actor: actor.memberId, p_circle_id: id, p_expected_revision: body.expectedRevision,
      p_request_id: requestId, ...(action === 'rsvp' ? { p_date: body.date, p_status: body.status } : {}) }, value => {
      const parsed = parseCircleMembershipReceipt(value, action, id, requestId);
      if (!parsed || parsed.state.revision < (body.expectedRevision as number)) return null;
      if (['join', 'leave'].includes(action) && parsed.state.revision <= (body.expectedRevision as number)) return null;
      if (completion) return parseOwnedCircleCompleteReceipt({ memberId: actor.memberId.toLowerCase(), ...parsed }, id, requestId, completion.expectedMemberId);
      if (attendance) {
        if (parsed.state.revision <= attendance.expectedRevision || parsed.receipt.date !== attendance.date || parsed.receipt.status !== attendance.status) return null;
        return parseCircleAttendanceReceipt({ memberId: actor.memberId.toLowerCase(), ...parsed }, id, requestId, attendance.expectedMemberId);
      }
      return parsed;
    }, true);
  } catch { return unavailable(true); }
}
