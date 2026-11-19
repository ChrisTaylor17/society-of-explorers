import { isUuid } from '@/lib/ids/uuid';
export const SUPPORTER_OFFER_ID = 'soe-supporter-monthly-v1';
export const SUPPORTER_TERMS_VERSION = 'supporter-2026-11-03-v1';
export const SUPPORTER_METADATA_TYPE = 'soe_supporter_v1';
export type SupporterMode = 'test' | 'live';
export type SupporterOperation = 'checkout' | 'portal';
export type SupporterOffer = { offerId: typeof SUPPORTER_OFFER_ID; termsVersion: typeof SUPPORTER_TERMS_VERSION; amount: 1000; currency: 'usd'; interval: 'month'; salesOpen: boolean; managementAvailable: boolean; mode: SupporterMode | null };
export type SupporterStatus = { revision: number; status: 'none' | 'pending' | 'active' | 'ending' | 'attention' | 'review' | 'unavailable'; mode: SupporterMode | null; reviewToken: string;
  canCheckout: boolean; canManage: boolean; legacy: boolean; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null;
  pendingAttempt: { requestId: string; attemptId: string; operation: SupporterOperation; expiresAt: string; retryUntil: string } | null };
export type SupporterReceipt = { requestId: string; attemptId: string; operation: SupporterOperation; revision: number; mode: SupporterMode; reviewToken: string; url: string | null; replayed: boolean; outcome: 'ready' | 'pending' };
export type SupporterReturn = SupporterStatus & { returnState: 'confirmed' | 'pending' | 'review' };
export const supporterRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const supporterRevision = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const supporterDate = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
export function supporterDestination(value: unknown, operation: SupporterOperation): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port
    && (operation === 'checkout' ? u.hostname === 'checkout.stripe.com' && /^\/c\/pay\/[A-Za-z0-9_-]+/.test(u.pathname)
      : u.hostname === 'billing.stripe.com' && /^\/p\/session\/[A-Za-z0-9_-]+/.test(u.pathname)); } catch { return false; }
}
export function parseSupporterOffer(v: unknown): SupporterOffer | null {
  if (!supporterRecord(v) || v.offerId !== SUPPORTER_OFFER_ID || v.termsVersion !== SUPPORTER_TERMS_VERSION || v.amount !== 1000 || v.currency !== 'usd' || v.interval !== 'month'
    || typeof v.salesOpen !== 'boolean' || typeof v.managementAvailable !== 'boolean' || ![null, 'test', 'live'].includes(v.mode as null)
    || ((v.salesOpen || v.managementAvailable) && v.mode === null)) return null;
  return { offerId: SUPPORTER_OFFER_ID, termsVersion: SUPPORTER_TERMS_VERSION, amount: 1000, currency: 'usd', interval: 'month', salesOpen: v.salesOpen, managementAvailable: v.managementAvailable, mode: v.mode as SupporterMode | null };
}
export function parseSupporterStatus(v: unknown): SupporterStatus | null {
  if (!supporterRecord(v) || !supporterRevision(v.revision) || !['none','pending','active','ending','attention','review','unavailable'].includes(String(v.status))
    || ![null,'test','live'].includes(v.mode as null) || typeof v.reviewToken !== 'string' || !/^[a-f0-9]{64}$/.test(v.reviewToken) || !['canCheckout','canManage','legacy','cancelAtPeriodEnd'].every(k => typeof v[k] === 'boolean')
    || !(v.currentPeriodEnd === null || supporterDate(v.currentPeriodEnd)) || (v.canCheckout && (v.legacy || v.status !== 'none' || v.pendingAttempt !== null))
    || (v.status === 'ending' && !v.cancelAtPeriodEnd) || (v.legacy && ['active','ending'].includes(String(v.status)))) return null;
  let pendingAttempt: SupporterStatus['pendingAttempt'] = null;
  if (v.pendingAttempt !== null) {
    const p = v.pendingAttempt;
    if (!supporterRecord(p) || !isUuid(p.requestId) || p.attemptId !== p.requestId || !['checkout','portal'].includes(String(p.operation))
      || !supporterDate(p.expiresAt) || !supporterDate(p.retryUntil)) return null;
    pendingAttempt = { requestId: p.requestId, attemptId: p.requestId, operation: p.operation as SupporterOperation, expiresAt: p.expiresAt, retryUntil: p.retryUntil };
  }
  return { revision: v.revision, status: v.status as SupporterStatus['status'], mode: v.mode as SupporterMode | null, reviewToken: v.reviewToken, canCheckout: v.canCheckout as boolean,
    canManage: v.canManage as boolean, legacy: v.legacy as boolean, cancelAtPeriodEnd: v.cancelAtPeriodEnd as boolean, currentPeriodEnd: v.currentPeriodEnd as string | null, pendingAttempt };
}
export function parseSupporterReceipt(v: unknown, expected?: { requestId: string; operation: SupporterOperation }): SupporterReceipt | null {
  if (!supporterRecord(v) || !isUuid(v.requestId) || v.attemptId !== v.requestId || !['checkout','portal'].includes(String(v.operation)) || !supporterRevision(v.revision)
    || typeof v.reviewToken !== 'string' || !/^[a-f0-9]{64}$/.test(v.reviewToken) || typeof v.replayed !== 'boolean' || !['test','live'].includes(String(v.mode)) || !['ready','pending'].includes(String(v.outcome)) || (v.outcome === 'ready' ? !supporterDestination(v.url, v.operation as SupporterOperation) : v.url !== null)
    || (expected && (v.requestId !== expected.requestId || v.operation !== expected.operation))) return null;
  return { requestId: v.requestId, attemptId: v.requestId, operation: v.operation as SupporterOperation, revision: v.revision, mode: v.mode as SupporterMode, reviewToken: v.reviewToken, url: v.url as string | null, replayed: v.replayed, outcome: v.outcome as SupporterReceipt['outcome'] };
}
export function parseSupporterReturn(v: unknown): SupporterReturn | null {
  const status = parseSupporterStatus(v);
  if (!status || !supporterRecord(v) || !['confirmed','pending','review'].includes(String(v.returnState))
    || (v.returnState === 'confirmed' && !['active','ending'].includes(status.status))) return null;
  return { ...status, returnState: v.returnState as SupporterReturn['returnState'] };
}
