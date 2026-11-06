import { isUuid } from '../ids/uuid';

export const ACCOUNT_DELETION_PATH = '/account/delete';

export type DeletionOwner = { provider: 'supabase' | 'wallet'; subject: string };
export type DeletionReceipt = { id: string; requestedAt: string; reviewBy: string };

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

export function parseDeletionReceipt(value: unknown): DeletionReceipt | null {
  const receipt = record(value);
  if (!receipt || Object.keys(receipt).length !== 3) return null;
  const { id, requestedAt, reviewBy } = receipt;
  if (!isUuid(id) || typeof requestedAt !== 'string' || typeof reviewBy !== 'string') return null;
  const requested = Date.parse(requestedAt), review = Date.parse(reviewBy);
  return Number.isFinite(requested) && Number.isFinite(review) && review > requested ? { id, requestedAt, reviewBy } : null;
}

export function parseDeletionCode(value: unknown): { id: string; secret: string } | null {
  if (typeof value !== 'string' || value.length !== 101) return null;
  const [id, secret] = value.split('.');
  return isUuid(id) && id === id.toLowerCase() && /^[a-f0-9]{64}$/.test(secret) ? { id, secret } : null;
}
