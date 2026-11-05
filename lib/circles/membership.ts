import { parsePublicProfileReference } from '@/lib/members/public-reference';
import { isUuid } from '@/lib/ids/uuid';
import { parseReadingProgram, type ReadingProgram } from './reading-program';

export const CIRCLE_MEMBERSHIP_PAGE_SIZE = 25;
export const CIRCLE_MEMBERSHIP_BODY_MAX_BYTES = 12_000;
export const CIRCLE_MAX_ACTIVE_HOSTED = 3;
export type CircleParticipationAction = 'create' | 'join' | 'leave' | 'rsvp' | 'complete';
export type CircleRsvpStatus = 'going' | 'not_going';
export type CircleCapabilities = { canJoin: boolean; canLeave: boolean; canRsvp: boolean; canComplete: boolean; canReadConversation: boolean };
export type CircleViewer = { signed_in: boolean; is_member: boolean; is_host: boolean };
export type CirclePublicSummary = {
  id: string; title: string; description: string | null; format: 'in_person' | 'online' | 'hybrid'; format_label: string;
  city: string | null; region: string | null; venue_name: string | null; venue_label: string; meeting_label: string;
  weekday: number; time: string; timezone: string; start_date: string; first_meeting: string; next_meeting: string | null; week: number;
  reading: { week: number; title: string; slug: string; author: string; selection: string } | null;
  reading_program: ReadingProgram | null; program_length: number;
  publicProfileId?: string | null; member_count: number; max_members: number; spots_left: number; status: string; host_name: string; going_next: number | null; hidden: boolean;
};
export type CircleMembershipSummary = { circle: CirclePublicSummary; revision: number; viewer: CircleViewer; ended: boolean; capabilities: CircleCapabilities };
export type CircleDetail = CircleMembershipSummary & { ready: true; meetings: Array<{ date: string; going: number; my_status: CircleRsvpStatus | null }>; online_url: string | null };
export type CircleListing = Pick<CirclePublicSummary, 'id' | 'title' | 'description' | 'format_label' | 'meeting_label' | 'next_meeting' | 'host_name'>;
export type CircleManagement = { kind: 'management'; circle: { id: string; title: string | null; hidden: boolean }; revision: number;
  viewer: CircleViewer; capabilities: { canLeave: boolean; canComplete: boolean } };
export type MyCircle = (CircleMembershipSummary & { kind: 'circle' }) | CircleManagement;
export type MyCircles = { items: MyCircle[]; nextCursor: string | null };
export type CircleStart = { canCreate: boolean; activeHosted: number; maxActiveHosted: 3 };
export type CircleParticipationState = CircleCapabilities & { revision: number; isMember: boolean; isHost: boolean; hidden: boolean; completed: boolean; ended: boolean };
export type CircleMembershipReceipt = {
  requestId: string; circleId: string;
  receipt: { action: CircleParticipationAction; joined: boolean; completed: boolean; date: string | null; status: CircleRsvpStatus | null };
  state: CircleParticipationState; replayed: boolean;
};
export type CircleCreateReceipt = CircleMembershipReceipt;
export type CircleAttendanceMutation = { expectedMemberId: string; requestId: string; expectedRevision: number; date: string; status: CircleRsvpStatus };
export type CircleAttendanceReceipt = CircleMembershipReceipt & { memberId: string };
export const CIRCLE_ATTENDANCE_BODY_MAX_BYTES = 256;

export const membershipRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export const membershipText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
export const membershipInteger = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
export function membershipDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const nullableText = (value: unknown, max: number): value is string | null => value === null || membershipText(value, max);
export function parseCircleListing(value: unknown, circleId: string): CircleListing | null {
  if (!membershipRecord(value) || !isUuid(value.id) || value.id.toLowerCase() !== circleId.toLowerCase()
    || !membershipText(value.title, 200) || !value.title.trim() || !nullableText(value.description, 2000)
    || !membershipText(value.format_label, 200) || !membershipText(value.meeting_label, 200)
    || !membershipText(value.host_name, 40) || value.host_name.includes('@')
    || (value.next_meeting !== null && !membershipDay(value.next_meeting))) return null;
  return { id: value.id.toLowerCase(), title: value.title, description: value.description, format_label: value.format_label,
    meeting_label: value.meeting_label, next_meeting: value.next_meeting, host_name: value.host_name };
}

function capabilities(value: unknown): CircleCapabilities | null {
  if (!membershipRecord(value) || !['canJoin', 'canLeave', 'canRsvp', 'canComplete', 'canReadConversation'].every(key => typeof value[key] === 'boolean')) return null;
  return { canJoin: value.canJoin as boolean, canLeave: value.canLeave as boolean, canRsvp: value.canRsvp as boolean, canComplete: value.canComplete as boolean, canReadConversation: value.canReadConversation as boolean };
}
function viewer(value: unknown): CircleViewer | null {
  if (!membershipRecord(value) || !['signed_in', 'is_member', 'is_host'].every(key => typeof value[key] === 'boolean')
    || (!value.signed_in && (value.is_member || value.is_host))) return null;
  return { signed_in: value.signed_in as boolean, is_member: value.is_member as boolean, is_host: value.is_host as boolean };
}
function publicCircle(value: unknown): CirclePublicSummary | null {
  if (!membershipRecord(value) || !isUuid(value.id) || !membershipText(value.title, 200) || !value.title.trim()
    || !nullableText(value.description, 2000) || !['in_person', 'online', 'hybrid'].includes(String(value.format))
    || !['format_label', 'venue_label', 'meeting_label', 'status', 'host_name', 'timezone'].every(key => membershipText(value[key], 200))
    || !['forming', 'active', 'completed'].includes(String(value.status))
    || !['city', 'region', 'venue_name'].every(key => nullableText(value[key], 200))
    || !membershipInteger(value.weekday, 6) || !membershipText(value.time, 5) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)
    || !membershipDay(value.start_date) || !membershipDay(value.first_meeting)
    || (value.next_meeting !== null && !membershipDay(value.next_meeting))
    || !membershipInteger(value.week) || value.week < 1 || !membershipInteger(value.member_count, 100_000)
    || !membershipInteger(value.max_members, 12) || value.max_members < 3 || !membershipInteger(value.spots_left, 12)
    || (value.going_next !== null && !membershipInteger(value.going_next, 100_000)) || typeof value.hidden !== 'boolean') return null;
  const publicProfileId = parsePublicProfileReference(value.publicProfileId);
  if (publicProfileId === undefined || (value.hidden && publicProfileId !== null)) return null;
  let reading: CirclePublicSummary['reading'] = null;
  const program = value.reading_program == null ? null : parseReadingProgram(value.reading_program);
  if (value.reading_program != null && !program) return null;
  const programLength = program?.sessions.length ?? 12;
  if ((value.program_length !== undefined && value.program_length !== programLength) || value.week > programLength + 1
    || (program && value.reading !== null)) return null;
  if (value.reading !== null) {
    const r = value.reading;
    if (!membershipRecord(r) || !membershipInteger(r.week, 12) || r.week < 1 || r.week !== value.week
      || !['title', 'slug', 'author', 'selection'].every(key => membershipText(r[key], 1000))) return null;
    reading = { week: r.week, title: r.title as string, slug: r.slug as string, author: r.author as string, selection: r.selection as string };
  }
  return { id: value.id.toLowerCase(), title: value.title, description: value.description, format: value.format as CirclePublicSummary['format'],
    format_label: value.format_label as string, city: value.city as string | null, region: value.region as string | null,
    venue_name: value.venue_name as string | null, venue_label: value.venue_label as string, meeting_label: value.meeting_label as string,
    weekday: value.weekday, time: value.time, timezone: value.timezone as string, start_date: value.start_date,
    first_meeting: value.first_meeting, next_meeting: value.next_meeting, week: value.week, reading,
    reading_program: program, program_length: programLength,
    member_count: value.member_count, max_members: value.max_members, spots_left: value.spots_left, status: value.status as string,
    host_name: value.host_name as string, publicProfileId, going_next: value.going_next as number | null, hidden: value.hidden };
}
function summary(value: unknown): CircleMembershipSummary | null {
  if (!membershipRecord(value) || !membershipInteger(value.revision) || typeof value.ended !== 'boolean') return null;
  const circle = publicCircle(value.circle), who = viewer(value.viewer), can = capabilities(value.capabilities);
  if (!circle || !who || !can || ((value.ended || circle.hidden) && circle.next_meeting !== null)
    || circle.spots_left !== (value.ended ? 0 : Math.max(0, circle.max_members - circle.member_count))
    || (circle.status === 'completed' && !value.ended) || (circle.hidden && !who.is_member && !who.is_host)
    || (can.canJoin && (!who.signed_in || who.is_member || circle.hidden || value.ended || circle.spots_left === 0))
    || (can.canLeave && !who.is_member) || (can.canRsvp && (!who.is_member || circle.hidden || value.ended))
    || (can.canComplete && (!who.is_host || circle.status === 'completed'))
    || (can.canReadConversation && (!who.is_member || circle.hidden))) return null;
  return { circle, revision: value.revision, viewer: who, ended: value.ended, capabilities: can };
}
export function parseCircleDetail(value: unknown, circleId?: string): CircleDetail | null {
  if (!membershipRecord(value) || value.ready !== true || !Array.isArray(value.meetings) || value.meetings.length > 4) return null;
  const base = summary(value);
  if (!base || (circleId !== undefined && base.circle.id !== circleId.toLowerCase())
    || ((base.ended || base.circle.hidden) && value.meetings.length !== 0)) return null;
  // Attendance review must describe a real coordinate of the configured
  // weekly program, not merely a well-formed date supplied by a response.
  const start = new Date(`${base.circle.start_date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + (base.circle.weekday - start.getUTCDay() + 7) % 7);
  if (start.toISOString().slice(0, 10) !== base.circle.first_meeting) return null;
  const first = start.getTime(), weekMs = 7 * 24 * 60 * 60 * 1000;
  const meetings: CircleDetail['meetings'] = [];
  for (const meeting of value.meetings) {
    if (!membershipRecord(meeting) || !membershipDay(meeting.date) || !membershipInteger(meeting.going, 100_000)
      || ![null, 'going', 'not_going'].includes(meeting.my_status as null)
      || (meetings.length > 0 && meetings.at(-1)!.date >= meeting.date)
      || (!base.viewer.is_member && meeting.my_status !== null)) return null;
    const index = (Date.parse(`${meeting.date}T00:00:00Z`) - first) / weekMs;
    if (!Number.isInteger(index) || index < 0 || index >= base.circle.program_length) return null;
    meetings.push({ date: meeting.date, going: meeting.going, my_status: meeting.my_status as CircleRsvpStatus | null });
  }
  if (base.circle.next_meeting !== (meetings[0]?.date ?? null)) return null;
  if (base.viewer.is_member && !base.circle.hidden && base.circle.format !== 'in_person' && value.online_url === null) return null;
  let online_url: string | null = null;
  if (value.online_url !== null) {
    if (!base.viewer.is_member || base.circle.hidden || base.circle.format === 'in_person' || typeof value.online_url !== 'string' || value.online_url.length > 2048) return null;
    try { const url = new URL(value.online_url); if (url.protocol !== 'https:' || url.username || url.password) return null; online_url = url.href; }
    catch { return null; }
  }
  return { ...base, ready: true, meetings, online_url };
}
export function parseCircleStart(value: unknown): CircleStart | null {
  if (!membershipRecord(value) || typeof value.canCreate !== 'boolean' || !membershipInteger(value.activeHosted, 100_000)
    || value.maxActiveHosted !== 3 || (value.canCreate && value.activeHosted >= 3)) return null;
  return { canCreate: value.canCreate, activeHosted: value.activeHosted, maxActiveHosted: 3 };
}
export function parseCircleManagement(value: unknown, circleId?: string): CircleManagement | null {
  if (!membershipRecord(value) || value.kind !== 'management' || !membershipRecord(value.circle)
    || !isUuid(value.circle.id) || !nullableText(value.circle.title, 200) || typeof value.circle.hidden !== 'boolean'
    || !membershipInteger(value.revision) || !membershipRecord(value.capabilities)
    || typeof value.capabilities.canLeave !== 'boolean' || typeof value.capabilities.canComplete !== 'boolean') return null;
  const who = viewer(value.viewer);
  if (!who || !who.signed_in || (!who.is_member && !who.is_host)
    || value.capabilities.canLeave !== who.is_member || (value.capabilities.canComplete && !who.is_host)
    || (circleId !== undefined && value.circle.id.toLowerCase() !== circleId.toLowerCase())) return null;
  return { kind: 'management', circle: { id: value.circle.id.toLowerCase(), title: value.circle.title, hidden: value.circle.hidden },
    revision: value.revision, viewer: who, capabilities: { canLeave: value.capabilities.canLeave, canComplete: value.capabilities.canComplete } };
}
export function parseMyCircles(value: unknown, page: { after?: string | null; limit?: number } = {}): MyCircles | null {
  const limit = page.limit ?? CIRCLE_MEMBERSHIP_PAGE_SIZE;
  if (!membershipRecord(value) || !Array.isArray(value.items) || value.items.length > limit
    || (value.nextCursor !== null && !isUuid(value.nextCursor))) return null;
  const items: MyCircle[] = [];
  for (const item of value.items) {
    if (!membershipRecord(item)) return null;
    const base = item.kind === 'circle' ? summary(item) : null;
    const parsed: MyCircle | null = item.kind === 'management' ? parseCircleManagement(item) : base ? { ...base, kind: 'circle' } : null;
    if (!parsed || !parsed.viewer.signed_in || (!parsed.viewer.is_member && !parsed.viewer.is_host)
      || (items.length > 0 && items.at(-1)!.circle.id >= parsed.circle.id)
      || (page.after && parsed.circle.id <= page.after.toLowerCase())) return null;
    items.push(parsed);
  }
  if (value.nextCursor !== null && (items.length !== limit || value.nextCursor !== items.at(-1)?.circle.id)) return null;
  return { items, nextCursor: value.nextCursor as string | null };
}
export function parseCircleMembershipReceipt(value: unknown, action?: CircleParticipationAction, circleId?: string, requestId?: string): CircleMembershipReceipt | null {
  if (!membershipRecord(value) || !isUuid(value.requestId) || !isUuid(value.circleId) || !membershipRecord(value.receipt)
    || !membershipRecord(value.state) || typeof value.replayed !== 'boolean') return null;
  const r = value.receipt, s = value.state, can = capabilities(s);
  if (!can || !['create', 'join', 'leave', 'rsvp', 'complete'].includes(String(r.action))
    || typeof r.joined !== 'boolean' || typeof r.completed !== 'boolean' || !membershipInteger(s.revision)
    || !['isMember', 'isHost', 'hidden', 'completed', 'ended'].every(key => typeof s[key] === 'boolean')
    || (r.action === 'rsvp' ? !membershipDay(r.date) || !['going', 'not_going'].includes(String(r.status)) : r.date !== null || r.status !== null)
    || (action !== undefined && r.action !== action) || (circleId !== undefined && value.circleId !== circleId.toLowerCase())
    || (requestId !== undefined && value.requestId !== requestId.toLowerCase())
    || (['create', 'join', 'rsvp'].includes(String(r.action)) && (!r.joined || r.completed))
    || (r.action === 'leave' && r.joined) || (r.action === 'complete' && !r.completed)
    || (s.completed && (!s.ended || can.canJoin || can.canRsvp || can.canComplete))
    || (can.canJoin && (s.isMember || s.hidden || s.ended)) || (can.canLeave && !s.isMember)
    || (can.canRsvp && (!s.isMember || s.hidden || s.ended)) || (can.canComplete && (!s.isHost || s.completed))
    || (can.canReadConversation && (!s.isMember || s.hidden))) return null;
  return { requestId: value.requestId.toLowerCase(), circleId: value.circleId.toLowerCase(), replayed: value.replayed,
    receipt: { action: r.action as CircleParticipationAction, joined: r.joined, completed: r.completed, date: r.date as string | null, status: r.status as CircleRsvpStatus | null },
    state: { revision: s.revision, isMember: s.isMember as boolean, isHost: s.isHost as boolean, hidden: s.hidden as boolean,
      completed: s.completed as boolean, ended: s.ended as boolean, ...can } };
}
export function parseCircleCreateReceipt(value: unknown, requestId?: string): CircleCreateReceipt | null {
  return parseCircleMembershipReceipt(value, 'create', undefined, requestId);
}

const canonicalUuid = (value: unknown): value is string => isUuid(value) && value === value.toLowerCase();
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));

/** The reviewed account is a mismatch guard, never a source of authority. */
export function parseCircleAttendanceMutation(value: unknown): CircleAttendanceMutation | null {
  if (!membershipRecord(value) || !exactKeys(value, ['expectedMemberId', 'requestId', 'expectedRevision', 'date', 'status'])
    || !canonicalUuid(value.expectedMemberId) || !canonicalUuid(value.requestId) || !membershipInteger(value.expectedRevision)
    || !membershipDay(value.date) || (value.status !== 'going' && value.status !== 'not_going')) return null;
  return { expectedMemberId: value.expectedMemberId, requestId: value.requestId, expectedRevision: value.expectedRevision,
    date: value.date, status: value.status as CircleRsvpStatus };
}

export function circleAttendanceMutationBody(value: CircleAttendanceMutation): string {
  const parsed = parseCircleAttendanceMutation(value);
  if (!parsed) throw Error('A current reviewed RSVP is required');
  return JSON.stringify(parsed);
}

/** RSVP receipts bind the canonical account as well as the exact request.
 * Historical events do not override the current state returned beside them. */
export function parseCircleAttendanceReceipt(value: unknown, circleId?: string, requestId?: string, memberId?: string): CircleAttendanceReceipt | null {
  if (!membershipRecord(value) || !exactKeys(value, ['memberId', 'requestId', 'circleId', 'receipt', 'state', 'replayed'])
    || !canonicalUuid(value.memberId) || memberId !== undefined && value.memberId !== memberId
    || !membershipRecord(value.receipt) || !exactKeys(value.receipt, ['action', 'joined', 'completed', 'date', 'status'])
    || (value.receipt.status !== 'going' && value.receipt.status !== 'not_going')
    || !membershipRecord(value.state) || !exactKeys(value.state, ['revision', 'isMember', 'isHost', 'hidden', 'completed', 'ended',
      'canJoin', 'canLeave', 'canRsvp', 'canComplete', 'canReadConversation'])) return null;
  const receipt = parseCircleMembershipReceipt(value, 'rsvp', circleId, requestId);
  return receipt ? { memberId: value.memberId, ...receipt } : null;
}
