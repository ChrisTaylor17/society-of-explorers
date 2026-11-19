import { isUuid } from '@/lib/ids/uuid';
import {
  formatPassageMessage,
  parseBookPassage,
  parsePassageReference,
  type BookPassage,
  type PassageReference,
} from '@/lib/books/passages';

export type PassageAccess = { circleId: string };
export type PassagePreviewInput = { requestId: string; reference: PassageReference; comment: string };
export type PassagePostInput = PassagePreviewInput & { contentHash: string; reviewKey: string };
export type PassagePreview = PassagePreviewInput & {
  circleId: string;
  content: string;
  contentHash: string;
  reviewKey: string;
  source: BookPassage;
};
export type PassageReceipt = {
  outcome: 'confirmed';
  circleId: string;
  requestId: string;
  replayed: boolean;
  message: {
    id: string;
    member_name: string;
    content: string | null;
    created_at: string;
    is_mine: true;
    visibility: 'visible' | 'hidden' | 'withdrawn';
  };
};
export type PassageLookup = { circleId: string; requestId: string; receipt: PassageReceipt | null };
type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plain = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !controls.test(value)
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && isUuid(value);
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const sameReference = (a: PassageReference, b: PassageReference): boolean => JSON.stringify(a) === JSON.stringify(b);

export function validatePassagePreviewInput(value: unknown): Validation<PassagePreviewInput> {
  if (!record(value) || !exact(value, ['requestId', 'reference', 'comment']) || !uuid(value.requestId)
    || !plain(value.comment, 2000) || !value.comment.trim()) return { ok: false, error: 'Use a valid passage and a nonempty comment.' };
  const reference = parsePassageReference(value.reference);
  if (!reference) return { ok: false, error: 'Choose a valid source edition and passage.' };
  return { ok: true, value: { requestId: value.requestId.toLowerCase(), reference, comment: value.comment.trim() } };
}

export function validatePassagePostInput(value: unknown): Validation<PassagePostInput> {
  if (!record(value) || !exact(value, ['requestId', 'reference', 'comment', 'contentHash', 'reviewKey']) || !hash(value.contentHash) || !hash(value.reviewKey)) {
    return { ok: false, error: 'Review the exact passage and comment before posting.' };
  }
  const base = validatePassagePreviewInput({ requestId: value.requestId, reference: value.reference, comment: value.comment });
  return base.ok ? { ok: true, value: { ...base.value, contentHash: value.contentHash, reviewKey: value.reviewKey } } : base;
}

export function parsePassageAccess(value: unknown): PassageAccess | null {
  return record(value) && uuid(value.circleId) ? { circleId: value.circleId.toLowerCase() } : null;
}

export function parsePassagePreview(value: unknown): PassagePreview | null {
  if (!record(value) || !uuid(value.circleId) || !hash(value.contentHash) || !hash(value.reviewKey) || !plain(value.content, 2000)) return null;
  const base = validatePassagePreviewInput({ requestId: value.requestId, reference: value.reference, comment: value.comment });
  const source = parseBookPassage(value.source);
  if (!base.ok || !source || !sameReference(base.value.reference, source.reference)
    || value.comment !== base.value.comment || formatPassageMessage(base.value.comment, source) !== value.content) return null;
  return { ...base.value, circleId: value.circleId.toLowerCase(), content: value.content, contentHash: value.contentHash, reviewKey: value.reviewKey, source };
}

export function parsePassageReceipt(value: unknown): PassageReceipt | null {
  if (!record(value) || value.outcome !== 'confirmed' || !uuid(value.circleId) || !uuid(value.requestId) || typeof value.replayed !== 'boolean' || !record(value.message)) return null;
  const message = value.message;
  if (!uuid(message.id) || !plain(message.member_name, 200) || message.is_mine !== true
    || typeof message.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(message.created_at)
    || !Number.isFinite(Date.parse(message.created_at)) || !['visible', 'hidden', 'withdrawn'].includes(String(message.visibility))) return null;
  if (message.visibility === 'visible' ? !plain(message.content, 2000) || !message.content.trim() : message.content !== null) return null;
  return {
    outcome: 'confirmed', circleId: value.circleId.toLowerCase(), requestId: value.requestId.toLowerCase(), replayed: value.replayed,
    message: { id: message.id.toLowerCase(), member_name: message.member_name.includes('@') ? 'Explorer' : message.member_name,
      content: message.content as string | null, created_at: message.created_at, is_mine: true, visibility: message.visibility as PassageReceipt['message']['visibility'] },
  };
}

export function parsePassageLookup(value: unknown): PassageLookup | null {
  if (!record(value) || !uuid(value.circleId) || !uuid(value.requestId) || !Object.hasOwn(value, 'receipt')) return null;
  const receipt = value.receipt === null ? null : parsePassageReceipt(value.receipt);
  if (value.receipt !== null && (!receipt || !same(receipt.circleId, value.circleId) || !same(receipt.requestId, value.requestId) || !receipt.replayed)) return null;
  return { circleId: value.circleId.toLowerCase(), requestId: value.requestId.toLowerCase(), receipt };
}
