import { isUuid } from '@/lib/ids/uuid';

/** Tab-session recovery only. Never persist the reviewed listing or meeting URL. */
export type CircleCreationReference = { version: 1; memberId: string; requestId: string };
export type CircleCreationResult = { memberId: string; requestId: string; circleId: string | null };
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Read = { ok: true; reference: CircleCreationReference | null } | { ok: false };
export const circleCreationReferenceKey = (memberId: string) => `soe.circle-creation.v1:${memberId}`;
export const canonicalHostingId = (value: unknown): value is string => isUuid(value) && value === value.toLowerCase();
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function parseCircleCreationReference(value: unknown, memberId?: string): CircleCreationReference | null {
  return record(value) && exact(value, ['version', 'memberId', 'requestId']) && value.version === 1
    && canonicalHostingId(value.memberId) && canonicalHostingId(value.requestId) && (memberId === undefined || value.memberId === memberId)
    ? { version: 1, memberId: value.memberId, requestId: value.requestId } : null;
}
export function parseCircleCreationResult(value: unknown, reference: CircleCreationReference): CircleCreationResult | null {
  return record(value) && exact(value, ['memberId', 'requestId', 'circleId']) && value.memberId === reference.memberId
    && value.requestId === reference.requestId && (value.circleId === null || canonicalHostingId(value.circleId))
    ? { memberId: reference.memberId, requestId: reference.requestId, circleId: value.circleId } : null;
}
export function readCircleCreationReference(storage: StorageAccess, memberId: string): Read {
  if (!canonicalHostingId(memberId)) return { ok: false };
  try {
    const raw = storage().getItem(circleCreationReferenceKey(memberId));
    if (raw === null) return { ok: true, reference: null };
    // A malformed reference is not evidence that an earlier request failed.
    if (raw.length > 180) return { ok: false };
    const reference = parseCircleCreationReference(JSON.parse(raw), memberId);
    return reference ? { ok: true, reference } : { ok: false };
  } catch { return { ok: false }; }
}
export function preserveCircleCreationReference(storage: StorageAccess, value: CircleCreationReference): boolean {
  const reference = parseCircleCreationReference(value);
  if (!reference) return false;
  try {
    const before = readCircleCreationReference(storage, reference.memberId);
    if (!before.ok || before.reference && before.reference.requestId !== reference.requestId) return false;
    const key = circleCreationReferenceKey(reference.memberId), raw = JSON.stringify(reference);
    storage().setItem(key, raw);
    return storage().getItem(key) === raw;
  } catch { return false; }
}
/** Clear only this exact, settled request. Failed readback keeps creation locked. */
export function clearCircleCreationReference(storage: StorageAccess, reference: CircleCreationReference): boolean {
  if (!parseCircleCreationReference(reference)) return false;
  try {
    const before = readCircleCreationReference(storage, reference.memberId);
    if (!before.ok || before.reference && before.reference.requestId !== reference.requestId) return false;
    const key = circleCreationReferenceKey(reference.memberId);
    storage().removeItem(key);
    return storage().getItem(key) === null;
  } catch { return false; }
}
