import { isUuid } from '../ids/uuid';

export const ACCOUNT_DELETION_PATH = '/account/delete';

export type DeletionOwner = { provider: 'supabase' | 'wallet'; subject: string };
// Omitted progress is an older receipt, not evidence that processing has not
// started. Explicit null is a recorded snapshot with no processing start.
export type DeletionReceipt = { id: string; requestedAt: string; reviewBy: string; processingStartedAt?: string | null };
export type DeletionProgress = 'unknown' | 'recorded' | 'processing';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function parseDeletionOwner(value: unknown): DeletionOwner | null {
  const owner = record(value);
  if (!owner || Object.keys(owner).length !== 2) return null;
  const { provider, subject } = owner;
  return (provider === 'supabase' || provider === 'wallet') && isUuid(subject) && subject === subject.toLowerCase()
    ? { provider, subject } : null;
}

export function sameDeletionOwner(a: DeletionOwner, b: DeletionOwner): boolean {
  return a.provider === b.provider && a.subject === b.subject;
}

/** Strict timezone-qualified calendar timestamp, preserving SQL microseconds. */
function timestamp(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!parts || parts[8] === '-00:00') return null;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const offsetHours = Number(parts[10] ?? 0), offsetMinutes = Number(parts[11] ?? 0);
  if (year < 1 || offsetHours > 23 || offsetMinutes > 59) return null;
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day); calendar.setUTCHours(hour, minute, second, 0);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) return null;
  const offset = (offsetHours * 60 + offsetMinutes) * (parts[9] === '-' ? -1 : 1);
  return BigInt(calendar.getTime() - offset * 60_000) * 1000n + BigInt((parts[7] ?? '').padEnd(6, '0'));
}

export function deletionReceiptProgress(receipt: DeletionReceipt): DeletionProgress {
  return receipt.processingStartedAt === undefined ? 'unknown' : receipt.processingStartedAt === null ? 'recorded' : 'processing';
}

export function parseDeletionReceipt(value: unknown): DeletionReceipt | null {
  const receipt = record(value);
  if (!receipt) return null;
  const hasProgress = Object.hasOwn(receipt, 'processingStartedAt');
  if (Object.keys(receipt).length !== (hasProgress ? 4 : 3)) return null;
  const { id, requestedAt, reviewBy } = receipt;
  if (!isUuid(id) || typeof requestedAt !== 'string' || typeof reviewBy !== 'string') return null;
  const requested = timestamp(requestedAt), review = timestamp(reviewBy);
  if (requested === null || review === null || review <= requested) return null;
  if (!hasProgress) return { id, requestedAt, reviewBy };
  const { processingStartedAt } = receipt;
  if (processingStartedAt === null) return { id, requestedAt, reviewBy, processingStartedAt: null };
  const processing = timestamp(processingStartedAt);
  return typeof processingStartedAt === 'string' && processing !== null && processing >= requested
    ? { id, requestedAt, reviewBy, processingStartedAt } : null;
}

export function parseDeletionCode(value: unknown): { id: string; secret: string } | null {
  if (typeof value !== 'string' || value.length !== 101) return null;
  const [id, secret] = value.split('.');
  return isUuid(id) && id === id.toLowerCase() && /^[a-f0-9]{64}$/.test(secret) ? { id, secret } : null;
}
