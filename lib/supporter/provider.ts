import Stripe from 'stripe-supporter';
import { createHash } from 'node:crypto';
import { isUuid } from '@/lib/ids/uuid';
import { SUPPORTER_METADATA_TYPE, SUPPORTER_OFFER_ID, SUPPORTER_TERMS_VERSION, supporterDestination, supporterRecord } from './contracts';
import { providerIdempotency, type SupporterConfig } from './config';
export type SubscriptionSnapshot = { id: string; status: string; cancelAtPeriodEnd: boolean; currentPeriodStart: string | null; currentPeriodEnd: string | null; paid: boolean };
export type ProviderState = { subscription: SubscriptionSnapshot | null; blocked: boolean; review: boolean; ownershipVerified: boolean };
export type ProviderSession = { id: string; url: string | null; expiresAt: string; status: 'open' | 'complete' | 'expired'; paid: boolean; subscriptionId: string | null };
export type ProviderEvent = { id: string; type: string; livemode: boolean; account?: string; data: { object: Record<string, unknown> } };
export type EventTarget = { accountId: string; customerId: string; kind: 'checkout' | 'subscription' | 'invoice' | 'risk'; requestId: string | null; session: ProviderSession | null };
export interface SupporterProvider {
  verifyAccount(): Promise<void>; verifyPrice(): Promise<void>; verifyPortal(): Promise<void>;
  customer(accountId: string, requestId: string): Promise<string>;
  state(customerId: string, accountId: string): Promise<ProviderState>;
  checkout(accountId: string, customerId: string, requestId: string, expiresAt: string): Promise<ProviderSession>;
  session(id: string, accountId: string, customerId: string, requestId: string): Promise<ProviderSession>;
  findSession(accountId: string, customerId: string, requestId: string): Promise<ProviderSession | null>;
  portal(accountId: string, customerId: string, requestId: string): Promise<{ id: string; url: string }>;
  legacy(customerId: string, actor: string): Promise<boolean>;
  event(bytes: Uint8Array, signature: string): ProviderEvent;
  targets(event: ProviderEvent): Promise<EventTarget[]>;
}
export class ProviderUnavailable extends Error { constructor() { super('Supporter provider verification unavailable'); } }
const rec = (v: unknown): Record<string, unknown> => { if (!supporterRecord(v)) throw new ProviderUnavailable(); return v; };
const id = (v: unknown, prefix: string): string => { const value = typeof v === 'string' ? v : supporterRecord(v) ? v.id : null;
  if (typeof value !== 'string' || !new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(value) || value.length > 200) throw new ProviderUnavailable(); return value; };
const date = (v: unknown): string => { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > 253402300799) throw new ProviderUnavailable(); return new Date(v * 1000).toISOString(); };
const states = new Set(['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused']);
const terminal = new Set(['canceled','incomplete_expired']);
export function createSupporterProvider(c: SupporterConfig): SupporterProvider {
  const stripe = new Stripe(c.key, { apiVersion: '2026-10-28.endive', maxNetworkRetries: 0, timeout: 5_000 });
  const mode = (v: Record<string, unknown>) => { if (v.livemode !== (c.mode === 'live')) throw new ProviderUnavailable(); };
  const metadata = (v: Record<string, unknown>, account: string): Record<string, unknown> => {
    const m = rec(v.metadata); if (m.type !== SUPPORTER_METADATA_TYPE || m.account_id !== account || m.scope !== c.scope) throw new ProviderUnavailable(); return m;
  };
  async function pageList(call: (after?: string) => Promise<unknown>): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = []; let after: string | undefined;
    for (let page = 0; page < 5; page++) {
      const response = rec(await call(after)); if (!Array.isArray(response.data) || typeof response.has_more !== 'boolean') throw new ProviderUnavailable();
      const rows = response.data.map(rec); all.push(...rows);
      if (!response.has_more) return all;
      if (!rows.length || typeof rows.at(-1)!.id !== 'string') throw new ProviderUnavailable();
      after = rows.at(-1)!.id as string;
    }
    throw new ProviderUnavailable(); // A bounded partial list never proves absence.
  }
  function price(value: unknown, requireActive = true) {
    const p = rec(value), product = rec(p.product), recurring = rec(p.recurring); mode(p); mode(product);
    if (p.id !== c.priceId || p.product === null || product.id !== c.productId || (requireActive && (product.active !== true || p.active !== true))
      || p.currency !== 'usd' || p.unit_amount !== 1000 || p.type !== 'recurring' || recurring.interval !== 'month' || recurring.interval_count !== 1
      || recurring.usage_type !== 'licensed') throw new ProviderUnavailable();
  }
  async function customerOwned(customerId: string, accountId: string) {
    const result = rec(await stripe.customers.retrieve(customerId)); mode(result); metadata(result, accountId);
    if (result.id !== customerId || result.deleted === true) throw new ProviderUnavailable();
  }
  async function sub(value: unknown, accountId: string, customerId: string): Promise<SubscriptionSnapshot> {
    const s = rec(value); mode(s); const m = metadata(s, accountId);
    if (m.offer_id !== SUPPORTER_OFFER_ID || m.terms_version !== SUPPORTER_TERMS_VERSION || !isUuid(m.request_id)) throw new ProviderUnavailable();
    if (id(s.customer,'cus') !== customerId || !states.has(String(s.status)) || typeof s.cancel_at_period_end !== 'boolean') throw new ProviderUnavailable();
    const items = rec(s.items); if (!Array.isArray(items.data) || items.data.length !== 1 || items.has_more !== false) throw new ProviderUnavailable();
    const item = rec(items.data[0]); if (item.quantity !== 1) throw new ProviderUnavailable(); price(item.price,false);
    const start = date(item.current_period_start), end = date(item.current_period_end); if (start >= end) throw new ProviderUnavailable();
    let paid = false;
    if (s.latest_invoice !== null) {
      const inv = rec(s.latest_invoice); mode(inv);
      const parent = rec(inv.parent), detail = rec(parent.subscription_details);
      if (id(inv.customer,'cus') !== customerId || parent.type !== 'subscription_details' || id(detail.subscription,'sub') !== s.id) throw new ProviderUnavailable();
      paid = s.status === 'active' && inv.status === 'paid' && inv.currency === 'usd' && typeof inv.amount_paid === 'number' && inv.amount_paid >= 1000;
    }
    if (s.pause_collection !== null && s.pause_collection !== undefined) paid = false;
    return { id: id(s.id,'sub'), status: String(s.status), cancelAtPeriodEnd: s.cancel_at_period_end, currentPeriodStart: start, currentPeriodEnd: end, paid };
  }
  const allSubscriptions = (customer: string) => pageList(after => stripe.subscriptions.list({ customer, status: 'all', limit: 100, ...(after ? { starting_after: after } : {}) }));
  async function providerState(customerId: string, accountId: string): Promise<ProviderState> {
    await customerOwned(customerId, accountId);
    const rows = await allSubscriptions(customerId); const normalized: Array<SubscriptionSnapshot & { created: number }> = [];
    let review = false;
    for (const row of rows) {
      try { const raw = rec(await stripe.subscriptions.retrieve(id(row.id,'sub'), { expand: ['latest_invoice','items.data.price.product'] }));
        if (raw.id !== row.id) throw new ProviderUnavailable();
        const snapshot = await sub(raw, accountId, customerId); normalized.push({ ...snapshot, created: typeof raw.created === 'number' ? raw.created : 0 });
      } catch { review = true; }
    }
    const openSessions = await pageList(after => stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100, ...(after ? { starting_after: after } : {}) }));
    for (const s of openSessions) { try { mode(s); const m = metadata(s,accountId); if (!isUuid(m.request_id) || m.offer_id !== SUPPORTER_OFFER_ID || m.terms_version !== SUPPORTER_TERMS_VERSION) review = true; } catch { review = true; } }
    const live = normalized.filter(s => !terminal.has(s.status)); if (live.length > 1) review = true;
    const chosen = live.length === 1 ? live[0] : [...normalized].sort((a,b) => b.created-a.created || a.id.localeCompare(b.id))[0];
    return { subscription: chosen ? { id: chosen.id, status: chosen.status, cancelAtPeriodEnd: chosen.cancelAtPeriodEnd, currentPeriodStart: chosen.currentPeriodStart, currentPeriodEnd: chosen.currentPeriodEnd, paid: !review && chosen.paid } : null,
      blocked: review || live.length > 0 || openSessions.length > 0, review, ownershipVerified: true };
  }
  function parseSession(v: unknown, accountId: string, customerId: string, requestId: string): ProviderSession {
    const s = rec(v); mode(s); const m = metadata(s, accountId);
    if (s.mode !== 'subscription' || id(s.customer,'cus') !== customerId || s.client_reference_id !== accountId || m.request_id !== requestId
      || m.offer_id !== SUPPORTER_OFFER_ID || m.terms_version !== SUPPORTER_TERMS_VERSION || !['open','complete','expired'].includes(String(s.status))) throw new ProviderUnavailable();
    const line = rec(s.line_items); if (!Array.isArray(line.data) || line.data.length !== 1 || line.has_more !== false) throw new ProviderUnavailable();
    const item = rec(line.data[0]); if (item.quantity !== 1) throw new ProviderUnavailable(); price(item.price,false);
    if (s.url !== null && !supporterDestination(s.url,'checkout')) throw new ProviderUnavailable();
    if (s.status === 'open' && !supporterDestination(s.url,'checkout')) throw new ProviderUnavailable();
    return { id: id(s.id,'cs'), url: s.url as string | null, expiresAt: date(s.expires_at), status: s.status as ProviderSession['status'], paid: s.payment_status === 'paid', subscriptionId: s.subscription === null ? null : id(s.subscription,'sub') };
  }
  const session = async (sessionId: string, accountId: string, customerId: string, requestId: string) => {
    const raw = rec(await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items.data.price.product'] }));
    if (raw.id !== sessionId) throw new ProviderUnavailable(); return parseSession(raw, accountId, customerId, requestId);
  };
  async function invoiceTarget(invoiceId: string): Promise<string | null> {
    const inv = rec(await stripe.invoices.retrieve(invoiceId)); mode(inv);
    if (inv.parent === null) return null;
    const parent = rec(inv.parent); return parent.type === 'subscription_details' ? id(rec(parent.subscription_details).subscription,'sub') : null;
  }
  async function subscriptionTarget(subscriptionId: string, kind: EventTarget['kind']): Promise<EventTarget | null> {
    const s = rec(await stripe.subscriptions.retrieve(subscriptionId)); mode(s);
    const m = rec(s.metadata); if (m.type !== SUPPORTER_METADATA_TYPE) return null;
    if (!isUuid(m.account_id) || m.scope !== c.scope) throw new ProviderUnavailable();
    return { accountId: m.account_id, customerId: id(s.customer,'cus'), kind, requestId: null, session: null };
  }
  return {
    verifyAccount: async () => { const a = rec(await stripe.accounts.retrieveCurrent()); if (a.id !== c.accountId) throw new ProviderUnavailable(); },
    verifyPrice: async () => { if (!c.priceId || !c.productId) throw new ProviderUnavailable(); price(await stripe.prices.retrieve(c.priceId, { expand: ['product'] })); },
    verifyPortal: async () => { if (!c.portalConfigurationId) throw new ProviderUnavailable(); const p = rec(await stripe.billingPortal.configurations.retrieve(c.portalConfigurationId)); mode(p);
      const features = rec(p.features); if (p.active !== true || rec(features.subscription_cancel).enabled !== true || rec(features.subscription_update).enabled !== false) throw new ProviderUnavailable(); },
    customer: async (accountId,requestId) => {
      const result = rec(await stripe.customers.create({ metadata: { type: SUPPORTER_METADATA_TYPE, account_id: accountId, scope: c.scope } },
        { idempotencyKey: providerIdempotency(c,accountId,requestId,'customer') })); mode(result); metadata(result,accountId); return id(result.id,'cus');
    },
    state: providerState,
    checkout: async (accountId,customerId,requestId,expiresAt) => {
      if (!c.priceId) throw new ProviderUnavailable();
      const m = { type: SUPPORTER_METADATA_TYPE, account_id: accountId, scope: c.scope, request_id: requestId, offer_id: SUPPORTER_OFFER_ID, terms_version: SUPPORTER_TERMS_VERSION };
      const created = rec(await stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId, client_reference_id: accountId,
        line_items: [{ price: c.priceId, quantity: 1 }], metadata: m, subscription_data: { metadata: m },
        expires_at: Math.floor(Date.parse(expiresAt)/1000), success_url: `${c.origin}/billing/return?attempt=${requestId}`, cancel_url: `${c.origin}/billing?attempt=${requestId}`,
        integration_identifier: 'soe_supporter_readiness_' + createHash('sha256').update(requestId).digest('hex').slice(0,8).replace(/[0-9a-f]/g, ch => String.fromCharCode(97+parseInt(ch,16))) }, { idempotencyKey: providerIdempotency(c,accountId,requestId,'checkout') }));
      return session(id(created.id,'cs'),accountId,customerId,requestId);
    },
    session,
    findSession: async (accountId,customerId,requestId) => {
      const rows = await pageList(after => stripe.checkout.sessions.list({ customer: customerId, limit: 100, ...(after ? { starting_after: after } : {}) }));
      const matching = rows.filter(s => supporterRecord(s.metadata) && s.metadata.request_id === requestId && s.metadata.account_id === accountId && s.metadata.type === SUPPORTER_METADATA_TYPE);
      if (matching.length > 1) throw new ProviderUnavailable(); return matching.length ? session(id(matching[0].id,'cs'),accountId,customerId,requestId) : null;
    },
    portal: async (accountId,customerId,requestId) => { if (!c.portalConfigurationId) throw new ProviderUnavailable();
      const p = rec(await stripe.billingPortal.sessions.create({ customer: customerId, configuration: c.portalConfigurationId, return_url: `${c.origin}/billing` },
        { idempotencyKey: providerIdempotency(c,accountId,requestId,'portal') }));
      if (p.customer !== customerId || !supporterDestination(p.url,'portal')) throw new ProviderUnavailable(); return { id: id(p.id,'bps'), url: p.url };
    },
    legacy: async (customerId,actor) => {
      const customer = rec(await stripe.customers.retrieve(customerId)); mode(customer); if (customer.deleted === true || customer.id !== customerId) return false;
      const rows = await allSubscriptions(customerId); if (!rows.length) return false;
      const legacyPrices = ['SEEKER','SCHOLAR','PHILOSOPHER','ORACLE'].map(tier => process.env[`${c.mode === 'test' ? 'STRIPE_TEST_PRICE_' : 'STRIPE_PRICE_'}${tier}`]).filter(Boolean);
      for (const row of rows) {
        const s = rec(await stripe.subscriptions.retrieve(id(row.id,'sub'))); mode(s); const m = rec(s.metadata), items = rec(s.items);
        if (Array.isArray(items.data) && items.data.length === 1) mode(rec(rec(items.data[0]).price));
        if (id(s.customer,'cus') !== customerId || m.member_id !== actor || m.type !== 'membership' || !states.has(String(s.status))
          || !Array.isArray(items.data) || items.data.length !== 1 || items.has_more !== false || rec(items.data[0]).quantity !== 1
          || !legacyPrices.includes(id(rec(items.data[0]).price,'price'))) return false;
      }
      return true;
    },
    event: (bytes,signature) => {
      if (!c.webhookSecret) throw new ProviderUnavailable(); const e = stripe.webhooks.constructEvent(Buffer.from(bytes),signature,c.webhookSecret);
      if (e.livemode !== (c.mode === 'live') || (e.account && e.account !== c.accountId) || !/^evt_[A-Za-z0-9]+$/.test(e.id) || !supporterRecord(e.data.object)) throw new ProviderUnavailable();
      return e as unknown as ProviderEvent;
    },
    targets: async event => {
      const o = event.data.object;
      if (event.type.startsWith('checkout.session.')) {
        const m = rec(o.metadata); if (m.type !== SUPPORTER_METADATA_TYPE) return [];
        if (!isUuid(m.account_id) || !isUuid(m.request_id) || m.scope !== c.scope) throw new ProviderUnavailable();
        const customerId = id(o.customer,'cus'); const fresh = await session(id(o.id,'cs'),m.account_id,customerId,m.request_id);
        return [{ accountId: m.account_id, customerId, kind: 'checkout', requestId: m.request_id, session: fresh }];
      }
      if (event.type.startsWith('customer.subscription.')) { const target = await subscriptionTarget(id(o.id,'sub'),'subscription'); return target ? [target] : []; }
      if (event.type.startsWith('invoice.')) { const subId = await invoiceTarget(id(o.id,'in')); const target = subId ? await subscriptionTarget(subId,'invoice') : null; return target ? [target] : []; }
      if (['charge.refunded','charge.dispute.created','radar.early_fraud_warning.created'].includes(event.type)) {
        let paymentIntent = o.payment_intent ? id(o.payment_intent,'pi') : null;
        if (!paymentIntent) { const charge = event.type === 'charge.refunded' ? o : rec(await stripe.charges.retrieve(id(o.charge,'ch'))); mode(charge); paymentIntent = charge.payment_intent ? id(charge.payment_intent,'pi') : null; }
        if (!paymentIntent) throw new ProviderUnavailable();
        const payments = await pageList(after => stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: paymentIntent! }, status: 'paid', limit: 100, ...(after ? { starting_after: after } : {}) }));
        const targets: EventTarget[] = [];
        for (const payment of payments) { const subId = await invoiceTarget(id(payment.invoice,'in')); const target = subId ? await subscriptionTarget(subId,'risk') : null;
          if (target && !targets.some(t => t.accountId === target.accountId)) targets.push(target); }
        return targets;
      }
      return [];
    },
  };
}
