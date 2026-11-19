import { isUuid } from '@/lib/ids/uuid';
import { TIMEZONES, validateCircleInput, type CircleInput } from './schedule';
import { membershipDay, membershipInteger, membershipRecord, parseCircleMembershipReceipt, parseCircleStart,
  type CircleMembershipReceipt, type CircleStart } from './membership';

export const CIRCLE_CREATE_BODY_MAX_BYTES = 12_000;
export const CIRCLE_COMPLETE_BODY_MAX_BYTES = 160;
export type CircleCreateMutation = CircleInput & { expectedMemberId: string; requestId: string };
export type CircleCompleteMutation = { expectedMemberId: string; requestId: string; expectedRevision: number };
export type CircleHostingAccess = CircleStart & { memberId: string };
export type OwnedCircleReceipt = CircleMembershipReceipt & { memberId: string };
const canonicalUuid = (value: unknown): value is string => isUuid(value) && value === value.toLowerCase();
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const fields = ['title', 'description', 'format', 'city', 'region', 'venueName', 'venueType', 'weekday', 'time', 'timezone', 'startDate', 'maxMembers', 'onlineUrl'] as const;

/** Parse an already reviewed normalized listing. The supplied date anchors
 * normalization so an exact retry does not expire before SQL receipt lookup. */
export function parseCircleCreateMutation(value: unknown): CircleCreateMutation | null {
  if (!membershipRecord(value) || !canonicalUuid(value.expectedMemberId) || !canonicalUuid(value.requestId)
    || !membershipDay(value.startDate) || typeof value.timezone !== 'string' || !Object.hasOwn(TIMEZONES, value.timezone) || !exact(value, ['expectedMemberId', 'requestId', ...fields, ...(Object.hasOwn(value, 'readingProgram') ? ['readingProgram'] : []), ...(Object.hasOwn(value, 'admissionMode') ? ['admissionMode'] : [])])) return null;
  const parsed = validateCircleInput(value, new Date(`${value.startDate}T12:00:00Z`));
  if (!parsed.ok || fields.some(key => parsed.value[key] !== value[key])) return null;
  if (Object.hasOwn(value, 'readingProgram')) {
    const program = value.readingProgram, normalized = parsed.value.readingProgram;
    if (!normalized || !membershipRecord(program) || !exact(program, ['version', 'bookId', 'editionId', 'sessions'])
      || program.version !== normalized.version || program.bookId !== normalized.bookId || program.editionId !== normalized.editionId
      || !Array.isArray(program.sessions) || program.sessions.length !== normalized.sessions.length
      || program.sessions.some((session, index) => !membershipRecord(session) || !exact(session, ['from', 'to'])
        || session.from !== normalized.sessions[index].from || session.to !== normalized.sessions[index].to)) return null;
  }
  return { expectedMemberId: value.expectedMemberId, requestId: value.requestId,
    title: parsed.value.title, description: parsed.value.description, format: parsed.value.format, city: parsed.value.city,
    region: parsed.value.region, venueName: parsed.value.venueName, venueType: parsed.value.venueType, weekday: parsed.value.weekday,
    time: parsed.value.time, timezone: parsed.value.timezone, startDate: parsed.value.startDate, maxMembers: parsed.value.maxMembers,
    onlineUrl: parsed.value.onlineUrl, ...(parsed.value.readingProgram ? { readingProgram: parsed.value.readingProgram } : {}),
    ...(parsed.value.admissionMode ? { admissionMode: parsed.value.admissionMode } : {}) };
}
export function circleCreateMutationBody(value: CircleCreateMutation): string {
  const parsed = parseCircleCreateMutation(value);
  if (!parsed) throw Error('A current reviewed Circle listing is required');
  return JSON.stringify(parsed);
}
export function parseCircleCompleteMutation(value: unknown): CircleCompleteMutation | null {
  return membershipRecord(value) && exact(value, ['expectedMemberId', 'requestId', 'expectedRevision'])
    && canonicalUuid(value.expectedMemberId) && canonicalUuid(value.requestId) && membershipInteger(value.expectedRevision)
    ? { expectedMemberId: value.expectedMemberId, requestId: value.requestId, expectedRevision: value.expectedRevision } : null;
}
export function circleCompleteMutationBody(value: CircleCompleteMutation): string {
  const parsed = parseCircleCompleteMutation(value);
  if (!parsed) throw Error('A current reviewed Circle completion is required');
  return JSON.stringify(parsed);
}
export function parseCircleHostingAccess(value: unknown, memberId?: string): CircleHostingAccess | null {
  if (!membershipRecord(value) || !exact(value, ['memberId', 'canCreate', 'activeHosted', 'maxActiveHosted'])
    || !canonicalUuid(value.memberId) || (memberId !== undefined && value.memberId !== memberId)) return null;
  const parsed = parseCircleStart(value);
  return parsed ? { memberId: value.memberId, ...parsed } : null;
}
function ownedReceipt(value: unknown, action: 'create' | 'complete', circleId?: string, requestId?: string, memberId?: string): OwnedCircleReceipt | null {
  if (!membershipRecord(value) || !exact(value, ['memberId', 'requestId', 'circleId', 'receipt', 'state', 'replayed'])
    || !canonicalUuid(value.memberId) || !canonicalUuid(value.requestId) || !canonicalUuid(value.circleId)
    || (memberId !== undefined && value.memberId !== memberId)
    || !membershipRecord(value.receipt) || !exact(value.receipt, ['action', 'joined', 'completed', 'date', 'status'])
    || value.receipt.action !== action || value.receipt.date !== null || value.receipt.status !== null
    || !membershipRecord(value.state) || !exact(value.state, ['revision', 'isMember', 'isHost', 'hidden', 'completed', 'ended',
      'canJoin', 'canLeave', 'canRsvp', 'canComplete', 'canReadConversation'])) return null;
  const parsed = parseCircleMembershipReceipt(value, action, circleId, requestId);
  return parsed ? { memberId: value.memberId, ...parsed } : null;
}
export function parseOwnedCircleCreateReceipt(value: unknown, requestId?: string, memberId?: string): OwnedCircleReceipt | null {
  return ownedReceipt(value, 'create', undefined, requestId, memberId);
}
export function parseOwnedCircleCompleteReceipt(value: unknown, circleId?: string, requestId?: string, memberId?: string): OwnedCircleReceipt | null {
  return ownedReceipt(value, 'complete', circleId, requestId, memberId);
}
