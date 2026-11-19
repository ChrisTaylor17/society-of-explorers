import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { isUuid } from '@/lib/ids/uuid';
import { rateLimit } from '@/lib/rateLimit';
import { circleWriteOrigin, readCircleReviewJson } from '@/lib/circles/moderation-server';
import { SUPPORTER_OFFER_ID, SUPPORTER_TERMS_VERSION, supporterRecord, supporterRevision, type SupporterStatus, type SupporterReceipt, type SupporterOperation } from './contracts';
import { supporterConfig, supporterOffer, type SupporterConfig } from './config';
import { createSupporterProvider, type SupporterProvider, type ProviderState, type ProviderSession } from './provider';
import { legacyBilling, supporterRpc, SupporterFailure, type SupporterSnapshot, type LegacyBilling } from './repository';
const closed = () => privateJson({ error: 'Supporter sales are not open. Free reading and community remain available.', outcome: 'not_attempted' }, { status: 503 });
const errorResponse = (error: unknown, unknown = false) => {
  const status = error instanceof SupporterFailure ? error.status : 503;
  return privateJson({ error: status === 401 ? 'Sign in to check your own billing.' : status === 409 ? 'Billing changed or this request needs reconciliation. Refresh before confirming again.' : status === 404 ? 'Billing request not found.' : status === 403 ? 'Use this site and your own account for billing.' : 'Billing could not be verified. No payment or membership change is being assumed.',
    outcome: unknown || (error instanceof SupporterFailure && error.outcome === 'unknown') ? 'unknown' : 'not_attempted' }, { status });
};
export async function providerWait<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SupporterFailure()), 12_000); })]); }
  finally { clearTimeout(timer); }
}
async function actor(req: NextRequest): Promise<string> {
  const result = await getAuthenticatedMember(req); if (!result || !isUuid(result.memberId)) throw new SupporterFailure(401); return result.memberId.toLowerCase();
}
function configured(): SupporterConfig { const c = supporterConfig(); if (!c) throw new SupporterFailure(); return c; }
function reviewToken(a: string,c: SupporterConfig): string { return createHash('sha256').update(JSON.stringify([a,c.configHash])).digest('hex'); }
async function mutation(req: NextRequest, c: SupporterConfig, operation: SupporterOperation): Promise<{ requestId: string; expectedRevision: number; actor: string }> {
  const own = (req.nextUrl ?? new URL(req.url)).origin;
  if (own !== c.origin || circleWriteOrigin(req)) throw new SupporterFailure(403);
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || '')) throw new SupporterFailure(400);
  const read = await readCircleReviewJson(req); if (!read.ok) throw new SupporterFailure(read.response.status);
  const v = read.value;
  if (!supporterRecord(v) || !isUuid(v.requestId) || !supporterRevision(v.expectedRevision)
    || Object.keys(v).some(k => !['requestId','expectedRevision','expectedMode','reviewToken',...(operation === 'checkout' ? ['offerId','termsVersion'] : [])].includes(k))
    || (operation === 'checkout' && (v.offerId !== SUPPORTER_OFFER_ID || v.termsVersion !== SUPPORTER_TERMS_VERSION))) throw new SupporterFailure(400);
  if (v.expectedMode !== c.mode) throw new SupporterFailure(409);
  const canonical = await actor(req);
  if (v.reviewToken !== reviewToken(canonical,c)) throw new SupporterFailure(409);
  return { requestId: v.requestId.toLowerCase(), expectedRevision: v.expectedRevision, actor: canonical };
}
const args = (a: string,c: SupporterConfig) => ({ p_actor: a, p_scope: c.scope });
const readState = (a: string,c: SupporterConfig) => supporterRpc('soe_supporter_read',args(a,c));
async function verified(c: SupporterConfig): Promise<SupporterProvider> { const p = createSupporterProvider(c); await providerWait(p.verifyAccount()); return p; }
function pending(snapshot: SupporterSnapshot): SupporterStatus['pendingAttempt'] {
  const a = snapshot.attempt;
  if (a && ['pending','ready','unknown'].includes(a.status)) return { requestId: a.requestId, attemptId: a.requestId, operation: 'checkout', expiresAt: a.expiresAt, retryUntil: a.retryUntil };
  const p = snapshot.portalAttempt;
  if (p && ['pending','unknown'].includes(p.status)) return { requestId: p.requestId, attemptId: p.requestId, operation: 'portal', expiresAt: new Date(Date.parse(p.createdAt)+15*60_000).toISOString(), retryUntil: p.retryUntil };
  return null;
}
type Reviewed = { value: SupporterStatus; snapshot: SupporterSnapshot; legacy: LegacyBilling; provider: SupporterProvider; fresh: ProviderState|null };
async function review(a: string,c: SupporterConfig,snapshot?: SupporterSnapshot): Promise<Reviewed> {
  const s = snapshot ?? await readState(a,c), legacy = await legacyBilling(a), p = await verified(c);
  let own = false, fresh: ProviderState|null = null, portal = false;
  if (legacy.exists) {
    if (legacy.customerId && (!s.customerId || legacy.customerId === s.customerId)) own = await providerWait(p.legacy(legacy.customerId,a));
  } else if (s.accountId && s.customerId) { fresh = await providerWait(p.state(s.customerId,s.accountId)); own = fresh.ownershipVerified === true; }
  if (own && c.portalConfigurationId) { await providerWait(p.verifyPortal()); portal = true; }
  const active = !legacy.exists && !s.riskReview && fresh && !fresh.review && s.subscription?.paid && fresh.subscription?.paid
    && s.subscription.id === fresh.subscription.id && fresh.subscription.status === 'active' && s.subscription.currentPeriodEnd !== null && fresh.subscription.currentPeriodEnd !== null
    && Date.parse(s.subscription.currentPeriodEnd) === Date.parse(fresh.subscription.currentPeriodEnd)
    && fresh.subscription.currentPeriodEnd !== null && Date.parse(fresh.subscription.currentPeriodEnd)>Date.now();
  const waiting = pending(s);
  let status: SupporterStatus['status'] = s.riskReview || s.otherScopeBlocked || fresh?.review ? 'review' : active ? fresh!.subscription!.cancelAtPeriodEnd ? 'ending' : 'active'
    : waiting?.operation === 'checkout' ? 'pending' : fresh?.blocked || (s.subscription && !['canceled','incomplete_expired'].includes(s.subscription.status)) ? 'attention' : 'none';
  if (legacy.exists) status = s.riskReview ? 'review' : 'none';
  let canCheckout = false;
  if (!legacy.exists && status === 'none' && !waiting && !s.riskReview && !s.otherScopeBlocked && !fresh?.blocked && supporterOffer(c).salesOpen) {
    await providerWait(p.verifyPrice()); await providerWait(p.verifyPortal()); canCheckout = true;
  }
  return { value: { revision: s.revision, status, mode: c.mode, reviewToken: reviewToken(a,c), canCheckout, canManage: portal, legacy: legacy.exists,
    cancelAtPeriodEnd: active ? fresh!.subscription!.cancelAtPeriodEnd : false, currentPeriodEnd: active ? fresh!.subscription!.currentPeriodEnd : null, pendingAttempt: waiting },
    snapshot: s, legacy, provider: p, fresh };
}
export async function supporterOfferGet() { return privateJson(supporterOffer(supporterConfig())); }
export async function supporterStatusGet(req: NextRequest) {
  try { const a = await actor(req), c = configured(); return privateJson((await review(a,c)).value); } catch (e) { return errorResponse(e); }
}
function receipt(s: SupporterSnapshot, operation: SupporterOperation, requestId: string, replayed: boolean, url: string|null, c: SupporterConfig, a: string): SupporterReceipt {
  const mode = c.mode;
  return { requestId, attemptId: requestId, operation, revision: s.revision, mode, reviewToken: reviewToken(a,c), url, replayed, outcome: url ? 'ready' : 'pending' };
}
async function resolve(a: string,c: SupporterConfig,s: SupporterSnapshot,session: ProviderSession,p: SupporterProvider): Promise<SupporterSnapshot> {
  if (!s.attempt || !['complete','expired'].includes(session.status) || Date.parse(session.expiresAt) !== Date.parse(s.attempt.expiresAt)) throw new SupporterFailure(409);
  if (session.status === 'complete') {
    if (!s.customerId || !s.accountId || !session.subscriptionId) throw new SupporterFailure(409,'unknown');
    const fresh = await providerWait(p.state(s.customerId,s.accountId));
    if (!fresh.ownershipVerified || fresh.review || fresh.subscription?.id !== session.subscriptionId) throw new SupporterFailure(409,'unknown');
  }
  return supporterRpc('soe_supporter_checkout_resolve',{ ...args(a,c),p_request_id:s.attempt.requestId,p_expected_revision:s.revision,
    p_status: session.status === 'complete' ? 'completed' : 'expired',p_session_id:session.id,p_session_url:session.url,p_session_expires_at:session.expiresAt,p_subscription_id:session.status === 'complete' ? session.subscriptionId : null });
}
export async function supporterCheckoutPost(req: NextRequest) {
  let attempted = false, attempt: string|undefined, a: string|undefined, c: SupporterConfig|undefined;
  try {
    c = configured(); const input = await mutation(req,c,'checkout'); a = input.actor;
    if (!rateLimit(`supporter:checkout:${a}`,30,3_600_000).ok) throw new SupporterFailure(429);
    const initial = await readState(a,c), legacy = await legacyBilling(a);
    if (legacy.exists) throw new SupporterFailure(409);
    const isRetry = initial.attempt?.requestId === input.requestId;
    if (!supporterOffer(c).salesOpen && !isRetry) return closed();
    const p = await verified(c);
    if (!isRetry) { await providerWait(p.verifyPrice()); await providerWait(p.verifyPortal()); }
    // SQL serializes keys and accounts. A fresh provider scan complements, never
    // replaces, that durable guard. A known exact retry is inspected below.
    if (!isRetry && initial.customerId && initial.accountId) { const fresh = await providerWait(p.state(initial.customerId,initial.accountId)); if (fresh.blocked || fresh.review) throw new SupporterFailure(409); }
    let s = await supporterRpc('soe_supporter_checkout_begin',{ ...args(a,c),p_request_id:input.requestId,p_expected_revision:input.expectedRevision,
      p_offer_id:SUPPORTER_OFFER_ID,p_terms_version:SUPPORTER_TERMS_VERSION,p_config_hash:c.configHash });
    attempt = input.requestId; const replayed = s.replayed === true;
    if (!s.accountId || !s.attempt || s.attempt.requestId !== input.requestId || s.attempt.configHash !== c.configHash) throw new SupporterFailure();
    if (s.riskReview) throw new SupporterFailure(409);
    if (['completed','expired','rejected'].includes(s.attempt.status)) return privateJson(receipt(s,'checkout',input.requestId,true,null,c,a));
    if (s.customerId) {
      const known = s.attempt.sessionId ? await providerWait(p.session(s.attempt.sessionId,s.accountId,s.customerId,input.requestId))
        : await providerWait(p.findSession(s.accountId,s.customerId,input.requestId));
      if (known) {
        if (known.status !== 'open') { s = await resolve(a,c,s,known,p); return privateJson(receipt(s,'checkout',input.requestId,true,null,c,a)); }
        if (Date.parse(known.expiresAt) !== Date.parse(s.attempt.expiresAt) || !known.url) throw new SupporterFailure(409);
        s = await supporterRpc('soe_supporter_checkout_complete',{ ...args(a,c),p_request_id:input.requestId,p_customer_id:s.customerId,p_session_id:known.id,p_session_url:known.url,p_session_expires_at:known.expiresAt });
        return privateJson(receipt(s,'checkout',input.requestId,true,known.url,c,a));
      }
    }
    if (Date.now() >= Date.parse(s.attempt.retryUntil) || Date.now() >= Date.parse(s.attempt.expiresAt)-30*60_000) throw new SupporterFailure(409,'unknown');
    if (!supporterOffer(c).salesOpen) return closed(); // Sales closure never starts a new provider effect.
    await providerWait(p.verifyPrice()); await providerWait(p.verifyPortal());
    if (!s.customerId) {
      attempted = true;
      const customerId = await providerWait(p.customer(s.accountId,input.requestId));
      s = await supporterRpc('soe_supporter_checkout_customer',{ ...args(a,c),p_request_id:input.requestId,p_customer_id:customerId });
    }
    if (!s.customerId || !s.accountId || !s.attempt) throw new SupporterFailure();
    const fresh = await providerWait(p.state(s.customerId,s.accountId)); if (fresh.blocked || fresh.review) throw new SupporterFailure(409);
    attempted = true;
    const created = await providerWait(p.checkout(s.accountId,s.customerId,input.requestId,s.attempt.expiresAt));
    if (created.status !== 'open') { s = await resolve(a,c,s,created,p); return privateJson(receipt(s,'checkout',input.requestId,replayed,null,c,a)); }
    if (!created.url || Date.parse(created.expiresAt) !== Date.parse(s.attempt.expiresAt)) throw new SupporterFailure();
    s = await supporterRpc('soe_supporter_checkout_complete',{ ...args(a,c),p_request_id:input.requestId,p_customer_id:s.customerId,p_session_id:created.id,p_session_url:created.url,p_session_expires_at:created.expiresAt });
    return privateJson(receipt(s,'checkout',input.requestId,replayed,created.url,c,a));
  } catch (e) {
    if (attempted && a && c && attempt) { try { await supporterRpc('soe_supporter_checkout_unknown',{ ...args(a,c),p_request_id:attempt }); } catch { /* Original unknown remains closed. */ } }
    return errorResponse(e,attempted);
  }
}
export async function supporterPortalPost(req: NextRequest) {
  let attempted = false, a: string|undefined, c: SupporterConfig|undefined, requestId: string|undefined;
  try {
    c = configured(); const input = await mutation(req,c,'portal'); requestId = input.requestId; a = input.actor;
    if (!rateLimit(`supporter:portal:${a}`,30,3_600_000).ok) throw new SupporterFailure(429);
    const checked = await review(a,c); if (!checked.value.canManage) throw new SupporterFailure(409);
    const p = checked.provider;
    const configHash = createHash('sha256').update(JSON.stringify([c.scope,c.origin,c.portalConfigurationId])).digest('hex');
    let s = await supporterRpc('soe_supporter_portal_begin',{ ...args(a,c),p_request_id:input.requestId,p_expected_revision:input.expectedRevision,p_config_hash:configHash,
      p_legacy_customer_id: checked.legacy.exists ? checked.legacy.customerId : null });
    if (!s.accountId || !s.customerId || !s.portalAttempt || s.portalAttempt.requestId !== input.requestId) throw new SupporterFailure();
    const replayed = s.replayed === true;
    // An idempotent provider retry can return a previously created, short-lived
    // portal URL. After this conservative window require a fresh confirmed key.
    if (Date.now()>=Date.parse(s.portalAttempt.createdAt)+15*60_000) throw new SupporterFailure(409);
    if (s.portalAttempt.status === 'ready' && s.portalAttempt.sessionUrl) {
      return privateJson(receipt(s,'portal',input.requestId,true,s.portalAttempt.sessionUrl,c,a));
    }
    if (Date.now()>=Date.parse(s.portalAttempt.retryUntil)) throw new SupporterFailure(409,'unknown');
    attempted = true;
    const created = await providerWait(p.portal(s.accountId,s.customerId,input.requestId));
    s = await supporterRpc('soe_supporter_portal_complete',{ ...args(a,c),p_request_id:input.requestId,p_session_id:created.id,p_session_url:created.url });
    return privateJson(receipt(s,'portal',input.requestId,replayed,created.url,c,a));
  } catch (e) {
    if (attempted && a && c && requestId) { try { await supporterRpc('soe_supporter_portal_unknown',{ ...args(a,c),p_request_id:requestId }); } catch { /* Keep unknown closed. */ } }
    return errorResponse(e,attempted);
  }
}
export async function supporterReturnGet(req: NextRequest) {
  try {
    const query = (req.nextUrl ?? new URL(req.url)).searchParams;
    if (query.getAll('attempt').length !== 1 || [...query.keys()].some(k => k !== 'attempt') || !isUuid(query.get('attempt'))) throw new SupporterFailure(400);
    const a = await actor(req), c = configured(), key = query.get('attempt')!;
    const s = await supporterRpc('soe_supporter_return_read',{ ...args(a,c),p_request_id:key });
    if (!s.attempt || s.attempt.requestId !== key || !s.accountId || !s.customerId) throw new SupporterFailure(404);
    const checked = await review(a,c,s);
    const session = s.attempt.sessionId ? await providerWait(checked.provider.session(s.attempt.sessionId,s.accountId,s.customerId,key)) : await providerWait(checked.provider.findSession(s.accountId,s.customerId,key));
    const confirmed = s.attempt.status === 'completed' && session?.status === 'complete' && session.paid && session.subscriptionId === s.subscription?.id && ['active','ending'].includes(checked.value.status);
    return privateJson({ ...checked.value,returnState: s.riskReview || checked.value.status === 'review' ? 'review' : confirmed ? 'confirmed' : 'pending' });
  } catch (e) { return errorResponse(e); }
}
