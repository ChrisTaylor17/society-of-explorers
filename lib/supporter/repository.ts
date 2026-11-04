import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/ids/uuid';
import { SUPPORTER_OFFER_ID, SUPPORTER_TERMS_VERSION, supporterDate, supporterDestination, supporterRecord, supporterRevision } from './contracts';
import type { SubscriptionSnapshot } from './provider';
export type CheckoutAttempt = { requestId: string; status: 'pending'|'ready'|'unknown'|'completed'|'expired'|'rejected'; createdAt: string; expiresAt: string; retryUntil: string;
  offerId: string; termsVersion: string; configHash: string; customerId: string|null; sessionId: string|null; sessionUrl: string|null; sessionExpiresAt: string|null; subscriptionId: string|null; resolvedAt: string|null };
export type PortalAttempt = { requestId: string; status: 'pending'|'ready'|'unknown'; createdAt: string; retryUntil: string; configHash: string; sessionId: string|null; sessionUrl: string|null };
export type SupporterSnapshot = { accountId: string|null; revision: number; customerId: string|null; riskReview: boolean; otherScopeBlocked: boolean; attempt: CheckoutAttempt|null; portalAttempt: PortalAttempt|null; subscription: SubscriptionSnapshot|null; replayed?: boolean };
export class SupporterFailure extends Error { constructor(public status = 503, public outcome: 'unknown'|'not_attempted' = 'not_attempted') { super('Supporter operation unavailable'); } }
const providerId = (v: unknown, prefix: string) => typeof v === 'string' && v.length <= 200 && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(v);
const nullable = (v: unknown, prefix: string) => v === null || providerId(v,prefix);
const sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function parseSupporterSnapshot(v: unknown): SupporterSnapshot | null {
  if (!supporterRecord(v) || !(v.accountId === null || isUuid(v.accountId)) || !supporterRevision(v.revision) || !nullable(v.customerId,'cus') || typeof v.riskReview !== 'boolean' || typeof v.otherScopeBlocked !== 'boolean'
    || !Object.hasOwn(v,'attempt') || !Object.hasOwn(v,'portalAttempt') || !Object.hasOwn(v,'subscription') || (v.accountId === null && (v.revision !== 0 || v.customerId !== null || v.riskReview || v.attempt !== null || v.portalAttempt !== null || v.subscription !== null))) return null;
  let attempt: CheckoutAttempt|null = null, portalAttempt: PortalAttempt|null = null, subscription: SubscriptionSnapshot|null = null;
  if (v.attempt !== null) {
    const a = v.attempt;
    if (!supporterRecord(a) || !isUuid(a.requestId) || !['pending','ready','unknown','completed','expired','rejected'].includes(String(a.status))
      || !supporterDate(a.createdAt) || !supporterDate(a.expiresAt) || !supporterDate(a.retryUntil) || a.offerId !== SUPPORTER_OFFER_ID || a.termsVersion !== SUPPORTER_TERMS_VERSION || !sha(a.configHash)
      || !nullable(a.customerId,'cus') || !nullable(a.sessionId,'cs') || !(a.sessionUrl === null || supporterDestination(a.sessionUrl,'checkout')) || !(a.sessionExpiresAt === null || supporterDate(a.sessionExpiresAt))
      || !nullable(a.subscriptionId,'sub') || !(a.resolvedAt === null || supporterDate(a.resolvedAt))
      || Date.parse(a.expiresAt)-Date.parse(a.createdAt) !== 3_600_000 || Date.parse(a.retryUntil)-Date.parse(a.createdAt) !== 79_200_000
      || (a.status === 'ready' && (a.sessionId === null || a.sessionUrl === null)) || (a.sessionId !== null && (a.customerId !== v.customerId || a.sessionExpiresAt === null || Date.parse(a.sessionExpiresAt) !== Date.parse(a.expiresAt)))
      || (a.sessionUrl !== null && a.sessionId === null)) return null;
    attempt = { requestId: a.requestId, status: a.status as CheckoutAttempt['status'], createdAt: a.createdAt, expiresAt: a.expiresAt, retryUntil: a.retryUntil,
      offerId: a.offerId, termsVersion: a.termsVersion, configHash: a.configHash as string, customerId: a.customerId as string|null, sessionId: a.sessionId as string|null, sessionUrl: a.sessionUrl as string|null, sessionExpiresAt: a.sessionExpiresAt as string|null, subscriptionId: a.subscriptionId as string|null, resolvedAt: a.resolvedAt as string|null };
  }
  if (v.portalAttempt !== null) {
    const a = v.portalAttempt;
    if (!supporterRecord(a) || !isUuid(a.requestId) || !['pending','ready','unknown'].includes(String(a.status)) || !supporterDate(a.createdAt) || !supporterDate(a.retryUntil) || !sha(a.configHash)
      || !nullable(a.sessionId,'bps') || !(a.sessionUrl === null || supporterDestination(a.sessionUrl,'portal')) || (a.status === 'ready' && (a.sessionId === null || a.sessionUrl === null))) return null;
    portalAttempt = { requestId: a.requestId, status: a.status as PortalAttempt['status'], createdAt: a.createdAt, retryUntil: a.retryUntil, configHash: a.configHash as string, sessionId: a.sessionId as string|null, sessionUrl: a.sessionUrl as string|null };
  }
  if (v.subscription !== null) {
    const s = v.subscription;
    if (!supporterRecord(s) || !providerId(s.id,'sub') || !['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused'].includes(String(s.status))
      || typeof s.cancelAtPeriodEnd !== 'boolean' || typeof s.paid !== 'boolean' || !(s.currentPeriodStart === null || supporterDate(s.currentPeriodStart)) || !(s.currentPeriodEnd === null || supporterDate(s.currentPeriodEnd))
      || ((s.currentPeriodStart === null) !== (s.currentPeriodEnd === null))) return null;
    subscription = { id: s.id as string, status: String(s.status), cancelAtPeriodEnd: s.cancelAtPeriodEnd, currentPeriodStart: s.currentPeriodStart as string|null, currentPeriodEnd: s.currentPeriodEnd as string|null, paid: s.paid };
  }
  if (v.replayed !== undefined && typeof v.replayed !== 'boolean') return null;
  return { accountId: v.accountId as string|null, revision: v.revision, customerId: v.customerId as string|null, riskReview: v.riskReview, otherScopeBlocked: v.otherScopeBlocked, attempt, portalAttempt, subscription,
    ...(v.replayed === undefined ? {} : { replayed: v.replayed as boolean }) };
}
export async function supporterRpc(name: string, args: Record<string,unknown>): Promise<SupporterSnapshot> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc(name,args);
    if (error) { const code = supporterRecord(error) ? error.code : null; throw new SupporterFailure(code === 'PT400' ? 400 : code === 'PT403' ? 403 : code === 'PT404' ? 404 : code === 'PT409' ? 409 : 503); }
    const result = parseSupporterSnapshot(data); if (!result) throw new SupporterFailure(); return result;
  } catch (error) { if (error instanceof SupporterFailure) throw error; throw new SupporterFailure(); }
}
export type LegacyBilling = { exists: boolean; customerId: string|null };
/** Canonical actor only. This query never uses email or browser profile hints. */
export async function legacyBilling(actor: string): Promise<LegacyBilling> {
  const { data, error } = await getSupabaseAdmin().from('members').select('id,tier,stripe_customer_id').eq('id',actor).single();
  if (error || !supporterRecord(data) || data.id !== actor || !(data.tier === null || typeof data.tier === 'string') || !nullable(data.stripe_customer_id,'cus')) throw new SupporterFailure();
  const tier = data.tier; return { exists: (typeof tier === 'string' && !['free','explorer',''].includes(tier)) || data.stripe_customer_id !== null, customerId: data.stripe_customer_id as string|null };
}
