import { isUuid } from '@/lib/ids/uuid';

export const DISCUSSION_MESSAGE_LIMIT = 2000;
export const DISCUSSION_PAGE_LIMIT = 25;
export type ThreadMessage = {
  id: string; member_name: string; content: string | null; created_at: string | null; is_mine: boolean;
  visibility: 'visible' | 'hidden' | 'withdrawn' | 'unavailable'; parentMessageId: string | null; rootMessageId: string;
};
export type DiscussionArchive = { kind: 'archive'; circleId: string; items: ThreadMessage[]; nextCursor: string | null; limit: number };
export type DiscussionThread = { kind: 'thread'; circleId: string; root: ThreadMessage; focus: ThreadMessage; items: ThreadMessage[]; nextCursor: string | null; limit: number };
export type DiscussionPage = DiscussionArchive | DiscussionThread;
export type DiscussionTarget = { message: ThreadMessage; revision: number; contentHash: string };
export type DiscussionTargetReply = { circleId: string; target: DiscussionTarget | null };
export type DiscussionPreviewInput = { requestId: string; comment: string; parentMessageId: string | null };
export type DiscussionPostInput = DiscussionPreviewInput & { expectedParentRevision: number | null; expectedParentHash: string | null; contentHash: string; reviewKey: string };
export type DiscussionPreview = DiscussionPreviewInput & {
  circleId: string; parent: DiscussionTarget | null; content: string; contentHash: string; reviewKey: string; commentLimit: number;
};
export type DiscussionReceipt = { outcome: 'confirmed'; circleId: string; requestId: string; replayed: boolean; message: ThreadMessage };
export type DiscussionLookup = { circleId: string; requestId: string; receipt: DiscussionReceipt | null };
export type DiscussionQuery =
  | { kind: 'archive'; before: string | null; limit: number }
  | { kind: 'thread'; messageId: string; after: string | null; limit: number }
  | { kind: 'receipt'; requestId: string };
type Validation<T> = { ok: true; value: T } | { ok: false; error: string };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const plain = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const uuid = (value: unknown): value is string => isUuid(value);
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const timestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value));
function displayName(value: string): string {
  if (!value.trim() || value.includes('@') || /[\r\n\t]/u.test(value)) return 'Explorer';
  let result = '';
  for (const character of value.trim()) { if (result.length + character.length > 200) break; result += character; }
  return result || 'Explorer';
}

export function discussionHref(circleId: string, messageId?: string | null): string {
  if (!uuid(circleId) || messageId !== undefined && messageId !== null && !uuid(messageId)) throw Error('Invalid discussion locator');
  return `/circles/${circleId.toLowerCase()}/discussion${messageId ? `?message=${messageId.toLowerCase()}` : ''}`;
}
export function discussionContentSuffix(circleId: string, parentMessageId: string | null): string {
  const href = discussionHref(circleId, parentMessageId);
  return parentMessageId ? `In reply to message:\n${href}` : '';
}
export function discussionCommentLimit(circleId: string, parentMessageId: string | null): number {
  const suffix = discussionContentSuffix(circleId, parentMessageId);
  return DISCUSSION_MESSAGE_LIMIT - (suffix ? suffix.length + 2 : 0);
}
export function formatDiscussionContent(circleId: string, comment: string, parentMessageId: string | null): string | null {
  if (!uuid(circleId) || parentMessageId !== null && !uuid(parentMessageId) || !plain(comment, DISCUSSION_MESSAGE_LIMIT)) return null;
  const normalized = comment.trim();
  if (!normalized || normalized.length > discussionCommentLimit(circleId, parentMessageId)) return null;
  const suffix = discussionContentSuffix(circleId, parentMessageId);
  return suffix ? `${normalized}\n\n${suffix}` : normalized;
}
/** Plain text can contain a forged link. It supplies no parent/root authority. */
export function discussionMessageHint(content: string): { circleId: string; messageId: string } | null {
  if (!plain(content, DISCUSSION_MESSAGE_LIMIT)) return null;
  const last = content.split('\n').at(-1) || '';
  const match = /^\/circles\/([^/]+)\/discussion\?message=([^&#]+)$/u.exec(last);
  if (!match || !uuid(match[1]) || !uuid(match[2]) || discussionHref(match[1], match[2]) !== last) return null;
  return { circleId: match[1].toLowerCase(), messageId: match[2].toLowerCase() };
}

export function parseDiscussionQuery(params: URLSearchParams): DiscussionQuery | null {
  if (Array.from(params.keys()).some(key => params.getAll(key).length !== 1)) return null;
  if (params.has('requestId')) return params.size === 1 && uuid(params.get('requestId')) ? { kind: 'receipt', requestId: params.get('requestId')!.toLowerCase() } : null;
  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? DISCUSSION_PAGE_LIMIT : /^[1-9][0-9]*$/u.test(rawLimit) ? Number(rawLimit) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DISCUSSION_PAGE_LIMIT) return null;
  if (params.has('message')) {
    if (Array.from(params.keys()).some(key => !['message', 'after', 'limit'].includes(key)) || !uuid(params.get('message'))
      || params.has('after') && !uuid(params.get('after'))) return null;
    return { kind: 'thread', messageId: params.get('message')!.toLowerCase(), after: params.get('after')?.toLowerCase() ?? null, limit };
  }
  if (Array.from(params.keys()).some(key => !['before', 'limit'].includes(key)) || params.has('before') && !uuid(params.get('before'))) return null;
  return { kind: 'archive', before: params.get('before')?.toLowerCase() ?? null, limit };
}
export function discussionSearchParams(query: Exclude<DiscussionQuery, { kind: 'receipt' }>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.kind === 'thread') { params.set('message', query.messageId); if (query.after) params.set('after', query.after); }
  else if (query.before) params.set('before', query.before);
  if (query.limit !== DISCUSSION_PAGE_LIMIT) params.set('limit', String(query.limit));
  const parsed = parseDiscussionQuery(params);
  if (!parsed || parsed.kind !== query.kind) throw Error('Invalid discussion page');
  return params;
}

export function parseThreadMessage(value: unknown): ThreadMessage | null {
  if (!record(value) || !uuid(value.id) || !plain(value.member_name, 400) || (value.created_at !== null && !timestamp(value.created_at))
    || typeof value.is_mine !== 'boolean' || !['visible', 'hidden', 'withdrawn', 'unavailable'].includes(String(value.visibility))
    || !uuid(value.rootMessageId) || value.parentMessageId !== null && !uuid(value.parentMessageId)) return null;
  const id = value.id.toLowerCase(), root = value.rootMessageId.toLowerCase(), parent = value.parentMessageId === null ? null : value.parentMessageId.toLowerCase();
  if (parent === null ? root !== id : parent === id || root === id) return null;
  if (value.visibility === 'visible' ? !timestamp(value.created_at) || !plain(value.content, DISCUSSION_MESSAGE_LIMIT) || !value.content.trim() : value.content !== null) return null;
  return { id, rootMessageId: root, parentMessageId: parent, member_name: displayName(value.member_name),
    content: value.content as string | null, created_at: value.created_at, is_mine: value.is_mine, visibility: value.visibility as ThreadMessage['visibility'] };
}
export function parseDiscussionPage(value: unknown, expected?: { circleId?: string; kind?: 'archive' | 'thread'; before?: string | null; messageId?: string; after?: string | null; limit?: number }): DiscussionPage | null {
  if (!record(value) || !['archive', 'thread'].includes(String(value.kind)) || !uuid(value.circleId)
    || !Number.isSafeInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > DISCUSSION_PAGE_LIMIT
    || !Array.isArray(value.items) || value.items.length > Number(value.limit)
    || value.nextCursor !== null && !uuid(value.nextCursor)) return null;
  const circleId = value.circleId.toLowerCase(), limit = Number(value.limit);
  if (expected?.circleId && !same(expected.circleId, circleId) || expected?.kind && expected.kind !== value.kind || expected?.limit && expected.limit !== limit) return null;
  const items: ThreadMessage[] = [], seen = new Set<string>();
  for (const raw of value.items) { const item = parseThreadMessage(raw); if (!item || seen.has(item.id)) return null; seen.add(item.id); items.push(item); }
  const nextCursor = value.nextCursor === null ? null : value.nextCursor.toLowerCase();
  if (nextCursor && (items.length !== limit || items.at(-1)?.id !== nextCursor)) return null;
  if (value.kind === 'archive') {
    if (expected?.before && (nextCursor === expected.before.toLowerCase() || seen.has(expected.before.toLowerCase()))) return null;
    return { kind: 'archive', circleId, items, nextCursor, limit };
  }
  const root = parseThreadMessage(value.root), focus = parseThreadMessage(value.focus);
  if (!root || root.parentMessageId !== null || !focus || focus.rootMessageId !== root.id
    || expected?.messageId && !same(focus.id, expected.messageId)
    || items.some(item => item.id === root.id || item.rootMessageId !== root.id || item.parentMessageId === null)
    || expected?.after && (nextCursor === expected.after.toLowerCase() || seen.has(expected.after.toLowerCase()))) return null;
  return { kind: 'thread', circleId, root, focus, items, nextCursor, limit };
}
export function parseDiscussionTarget(value: unknown): DiscussionTargetReply | null {
  if (!record(value) || !uuid(value.circleId) || !Object.hasOwn(value, 'target')) return null;
  if (value.target === null) return { circleId: value.circleId.toLowerCase(), target: null };
  const raw = value.target;
  if (!record(raw) || !revision(raw.revision) || !hash(raw.contentHash)) return null;
  const message = parseThreadMessage(raw.message);
  return message?.visibility === 'visible' ? { circleId: value.circleId.toLowerCase(), target: { message, revision: raw.revision, contentHash: raw.contentHash } } : null;
}
export function validateDiscussionPreviewInput(value: unknown): Validation<DiscussionPreviewInput> {
  if (!record(value) || !exact(value, ['requestId', 'comment', 'parentMessageId']) || !uuid(value.requestId)
    || !plain(value.comment, DISCUSSION_MESSAGE_LIMIT) || !value.comment.trim() || value.parentMessageId !== null && !uuid(value.parentMessageId)) {
    return { ok: false, error: 'Use a nonempty comment and a valid discussion target.' };
  }
  return { ok: true, value: { requestId: value.requestId.toLowerCase(), comment: value.comment.trim(), parentMessageId: value.parentMessageId === null ? null : value.parentMessageId.toLowerCase() } };
}
export function validateDiscussionPostInput(value: unknown): Validation<DiscussionPostInput> {
  if (!record(value) || !exact(value, ['requestId', 'comment', 'parentMessageId', 'expectedParentRevision', 'expectedParentHash', 'contentHash', 'reviewKey'])
    || !hash(value.contentHash) || !hash(value.reviewKey)) return { ok: false, error: 'Review the complete message before posting.' };
  const base = validateDiscussionPreviewInput({ requestId: value.requestId, comment: value.comment, parentMessageId: value.parentMessageId });
  if (!base.ok) return base;
  if (base.value.parentMessageId === null ? value.expectedParentRevision !== null || value.expectedParentHash !== null : !revision(value.expectedParentRevision) || !hash(value.expectedParentHash)) {
    return { ok: false, error: 'Review the current parent message before replying.' };
  }
  return { ok: true, value: { ...base.value, expectedParentRevision: value.expectedParentRevision as number | null, expectedParentHash: value.expectedParentHash as string | null, contentHash: value.contentHash, reviewKey: value.reviewKey } };
}
export function parseDiscussionPreview(value: unknown): DiscussionPreview | null {
  if (!record(value) || !uuid(value.circleId) || !hash(value.contentHash) || !hash(value.reviewKey) || !plain(value.content, DISCUSSION_MESSAGE_LIMIT)) return null;
  const base = validateDiscussionPreviewInput({ requestId: value.requestId, comment: value.comment, parentMessageId: value.parentMessageId });
  const parent = parseDiscussionTarget({ circleId: value.circleId, target: value.parent });
  if (!base.ok || !parent || value.comment !== base.value.comment || (parent.target?.message.id ?? null) !== base.value.parentMessageId
    || formatDiscussionContent(value.circleId, base.value.comment, base.value.parentMessageId) !== value.content
    || value.commentLimit !== discussionCommentLimit(value.circleId, base.value.parentMessageId)) return null;
  return { ...base.value, circleId: value.circleId.toLowerCase(), parent: parent.target, content: value.content, contentHash: value.contentHash, reviewKey: value.reviewKey, commentLimit: Number(value.commentLimit) };
}
export function parseDiscussionReceipt(value: unknown): DiscussionReceipt | null {
  if (!record(value) || value.outcome !== 'confirmed' || !uuid(value.circleId) || !uuid(value.requestId) || typeof value.replayed !== 'boolean') return null;
  const message = parseThreadMessage(value.message);
  return message?.is_mine ? { outcome: 'confirmed', circleId: value.circleId.toLowerCase(), requestId: value.requestId.toLowerCase(), replayed: value.replayed, message } : null;
}
export function parseDiscussionLookup(value: unknown): DiscussionLookup | null {
  if (!record(value) || !uuid(value.circleId) || !uuid(value.requestId) || !Object.hasOwn(value, 'receipt')) return null;
  const receipt = value.receipt === null ? null : parseDiscussionReceipt(value.receipt);
  if (value.receipt !== null && (!receipt || !same(receipt.circleId, value.circleId) || !same(receipt.requestId, value.requestId) || !receipt.replayed)) return null;
  return { circleId: value.circleId.toLowerCase(), requestId: value.requestId.toLowerCase(), receipt };
}
