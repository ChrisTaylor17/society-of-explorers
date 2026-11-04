import Stripe from 'stripe-supporter';
import { isUuid } from '@/lib/ids/uuid';
import { LegacyBillingFailure, legacyId, legacyRecord, type LegacyBillingConfig, type LegacyCatalogEntry, type LegacyTier } from './legacyBillingConfig';
export type LegacyEvent = {
    id: string;
    type: string;
    livemode: boolean;
    account?: string;
    data: {
        object: unknown;
    };
};
export type LegacySource = {
    id: string;
    kind: 'subscription' | 'lifetime';
    tier: LegacyTier;
    status: string;
    paid: boolean;
    valid: boolean;
    periodStart: string | null;
    periodEnd: string | null;
};
export type LegacyInvalidation = {
    kind: 'subscription' | 'lifetime';
    id: string;
};
export type LegacyCustomer = {
    customerId: string;
    sources: LegacySource[];
};
export type LegacySnapshot = {
    customers: LegacyCustomer[];
    invalidatedSourceIds: LegacyInvalidation[];
    needsReview: boolean;
};
export type LegacyTarget = {
    customerId: string;
    verifiedMemberId: string | null;
    invalidatedSourceIds: LegacyInvalidation[];
};
export interface LegacyProvider {
    verifyAccount(): Promise<void>;
    target(event: LegacyEvent): Promise<LegacyTarget | null>;
    customer(customerId: string, memberId: string): Promise<{
        customer: LegacyCustomer;
        invalidatedSourceIds: LegacyInvalidation[];
        needsReview: boolean;
    }>;
}
const rec = (v: unknown) => {
    if (!legacyRecord(v))
        throw new LegacyBillingFailure();
    return v;
};
const id = (v: unknown, prefix: string): string => {
    const value = typeof v === 'string' ? v : legacyRecord(v) ? v.id : null;
    if (!legacyId(value, prefix))
        throw new LegacyBillingFailure();
    return value;
};
const sec = (v: unknown): number => {
    if (!Number.isSafeInteger(v) || Number(v) < 0 || Number(v) > 253402300799)
        throw new LegacyBillingFailure();
    return v as number;
};
const amount = (v: unknown): number => {
    if (!Number.isSafeInteger(v) || Number(v) < 0)
        throw new LegacyBillingFailure();
    return v as number;
};
const statuses = new Set(['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused']);
type PaymentTruth = {
    paid: boolean;
    risk: boolean;
    fundingId: string | null;
};
/** Read-only provider adapter. It never creates or updates Stripe resources. */
export function createLegacyBillingProvider(c: LegacyBillingConfig): LegacyProvider {
    const stripe = new Stripe(c.key, { apiVersion: '2026-10-28.endive', maxNetworkRetries: 0, timeout: 5000 });
    const mode = (v: Record<string, unknown>) => {
        if (v.livemode !== (c.mode === 'live'))
            throw new LegacyBillingFailure();
    };
    async function pages(call: (after?: string) => Promise<unknown>): Promise<Record<string, unknown>[]> {
        const all: Record<string, unknown>[] = [];
        let after: string | undefined;
        for (let page = 0; page < 5; page++) {
            const response = rec(await call(after));
            if (!Array.isArray(response.data) || typeof response.has_more !== 'boolean')
                throw new LegacyBillingFailure();
            const rows = response.data.map(rec);
            all.push(...rows);
            if (!response.has_more)
                return all;
            if (!rows.length || typeof rows.at(-1)!.id !== 'string')
                throw new LegacyBillingFailure();
            after = rows.at(-1)!.id as string;
        }
        throw new LegacyBillingFailure();
    }
    function memberHint(value: Record<string, unknown>, expected?: string): string | null {
        const m = rec(value.metadata);
        if (m.type !== 'membership')
            throw new LegacyBillingFailure();
        const member = m.member_id;
        if (member !== undefined && member !== null && (!isUuid(member) || (expected !== undefined && member !== expected)))
            throw new LegacyBillingFailure();
        return isUuid(member) ? member : null;
    }
    function sessionHint(value: Record<string, unknown>, expected?: string): string | null {
        const member = memberHint(value, expected), reference = value.client_reference_id;
        if (reference !== null && reference !== undefined && (!isUuid(reference) || (member !== null && reference !== member) || (expected !== undefined && reference !== expected)))
            throw new LegacyBillingFailure();
        return member ?? (isUuid(reference) ? reference : null);
    }
    function catalog(value: unknown, kind: 'subscription' | 'lifetime'): LegacyCatalogEntry {
        const p = rec(value);
        mode(p);
        const product = rec(p.product);
        mode(product);
        const entry = c.catalog.find(x => x.priceId === p.id);
        if (!entry || entry.productId !== product.id || p.currency !== entry.currency || p.unit_amount !== entry.amount
            || (kind === 'lifetime' ? entry.tier !== 'oracle' || entry.interval !== null || p.type !== 'one_time' || p.recurring !== null
                : entry.tier === 'oracle' || entry.interval !== 'month' || p.type !== 'recurring' || rec(p.recurring).interval !== 'month' || rec(p.recurring).interval_count !== 1 || rec(p.recurring).usage_type !== 'licensed'))
            throw new LegacyBillingFailure();
        return entry; // Historical inactive prices remain explicit catalog entries.
    }
    async function retrieveSub(subId: string): Promise<Record<string, unknown>> {
        const s = rec(await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price.product', 'latest_invoice'] }));
        if (s.id !== subId)
            throw new LegacyBillingFailure();
        mode(s);
        return s;
    }
    async function retrieveSession(sessionId: string): Promise<Record<string, unknown>> {
        const s = rec(await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items.data.price.product'] }));
        if (s.id !== sessionId)
            throw new LegacyBillingFailure();
        mode(s);
        return s;
    }
    function subItem(s: Record<string, unknown>): {
        item: Record<string, unknown>;
        entry: LegacyCatalogEntry;
    } {
        const items = rec(s.items);
        if (!Array.isArray(items.data) || items.data.length !== 1 || items.has_more !== false)
            throw new LegacyBillingFailure();
        const item = rec(items.data[0]);
        if (item.quantity !== 1)
            throw new LegacyBillingFailure();
        return { item, entry: catalog(item.price, 'subscription') };
    }
    function sessionItem(s: Record<string, unknown>, kind: 'subscription' | 'lifetime'): LegacyCatalogEntry {
        const items = rec(s.line_items);
        if (!Array.isArray(items.data) || items.data.length !== 1 || items.has_more !== false)
            throw new LegacyBillingFailure();
        const item = rec(items.data[0]);
        if (item.quantity !== 1 || item.currency !== 'usd' || s.currency !== 'usd')
            throw new LegacyBillingFailure();
        return catalog(item.price, kind);
    }
    async function customerIdentity(customerId: string, memberId?: string) {
        const customer = rec(await stripe.customers.retrieve(customerId));
        if (customer.id !== customerId || customer.deleted === true)
            throw new LegacyBillingFailure();
        mode(customer);
        const m = rec(customer.metadata);
        if (m.member_id !== undefined && (!isUuid(m.member_id) || (memberId !== undefined && m.member_id !== memberId)))
            throw new LegacyBillingFailure();
        // A supporter customer has a separate opaque ownership contract.
        if (m.type === 'soe_supporter_v1')
            throw new LegacyBillingFailure();
    }
    async function chargeTruth(chargeId: string, customerId: string, minimum: number, piId: string | null): Promise<PaymentTruth> {
        const ch = rec(await stripe.charges.retrieve(chargeId));
        if (ch.id !== chargeId || id(ch.customer, 'cus') !== customerId || ch.currency !== 'usd' || (piId === null ? ch.payment_intent !== null : id(ch.payment_intent, 'pi') !== piId))
            throw new LegacyBillingFailure();
        mode(ch);
        if (typeof ch.paid !== 'boolean' || typeof ch.captured !== 'boolean' || typeof ch.refunded !== 'boolean' || typeof ch.disputed !== 'boolean')
            throw new LegacyBillingFailure();
        const risk = ch.refunded || ch.disputed || amount(ch.amount_refunded) > 0;
        return { paid: ch.paid && ch.captured && ch.status === 'succeeded' && amount(ch.amount_captured) >= minimum && !risk, risk, fundingId: chargeId };
    }
    async function intentTruth(piId: string, customerId: string, minimum: number): Promise<PaymentTruth> {
        const pi = rec(await stripe.paymentIntents.retrieve(piId));
        if (pi.id !== piId || id(pi.customer, 'cus') !== customerId || pi.currency !== 'usd')
            throw new LegacyBillingFailure();
        mode(pi);
        if (pi.status !== 'succeeded' || amount(pi.amount_received) < minimum)
            return { paid: false, risk: false, fundingId: null };
        if (pi.latest_charge === null)
            throw new LegacyBillingFailure();
        return chargeTruth(id(pi.latest_charge, 'ch'), customerId, minimum, piId);
    }
    async function invoiceTruth(invoiceId: string, subId: string, customerId: string, priceId: string, start: number, end: number): Promise<{
        paid: boolean;
        risk: boolean;
    }> {
        const inv = rec(await stripe.invoices.retrieve(invoiceId));
        if (inv.id !== invoiceId || id(inv.customer, 'cus') !== customerId || inv.currency !== 'usd')
            throw new LegacyBillingFailure();
        mode(inv);
        const parent = rec(inv.parent);
        if (parent.type !== 'subscription_details' || id(rec(parent.subscription_details).subscription, 'sub') !== subId)
            throw new LegacyBillingFailure();
        if (inv.status !== 'paid' || amount(inv.amount_remaining) !== 0 || amount(inv.amount_due) <= 0 || amount(inv.amount_paid) < amount(inv.amount_due))
            return { paid: false, risk: false };
        const lines = await pages(after => stripe.invoices.listLineItems(invoiceId, { limit: 100, ...(after ? { starting_after: after } : {}) }));
        const matching = lines.filter(l => {
            const p = rec(l.parent), pricing = rec(l.pricing), period = rec(l.period);
            return p.type === 'subscription_item_details'
                && id(rec(p.subscription_item_details).subscription, 'sub') === subId && pricing.type === 'price_details' && id(rec(pricing.price_details).price, 'price') === priceId
                && rec(p.subscription_item_details).proration !== true
                && sec(period.start) === start && sec(period.end) === end && l.quantity === 1 && l.currency === 'usd';
        });
        if (matching.length !== 1 || lines.length !== 1)
            throw new LegacyBillingFailure();
        const payments = await pages(after => stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid', limit: 100, ...(after ? { starting_after: after } : {}) }));
        let sum = 0, risk = false;
        const funding = new Set<string>(), paymentIds = new Set<string>();
        for (const payment of payments) {
            mode(payment);
            if (id(payment.invoice, 'in') !== invoiceId || payment.status !== 'paid' || payment.currency !== 'usd')
                throw new LegacyBillingFailure();
            const paymentId = id(payment.id, 'inpay');
            if (paymentIds.has(paymentId))
                throw new LegacyBillingFailure();
            paymentIds.add(paymentId);
            const paid = amount(payment.amount_paid);
            if (paid <= 0)
                throw new LegacyBillingFailure();
            const p = rec(payment.payment);
            const truth = p.type === 'payment_intent' ? await intentTruth(id(p.payment_intent, 'pi'), customerId, paid) : p.type === 'charge' ? await chargeTruth(id(p.charge, 'ch'), customerId, paid, null) : null;
            if (!truth)
                throw new LegacyBillingFailure();
            if (truth.fundingId !== null) {
                if (funding.has(truth.fundingId))
                    throw new LegacyBillingFailure();
                funding.add(truth.fundingId);
            }
            risk ||= truth.risk;
            if (truth.paid)
                sum += paid;
        }
        return { paid: sum >= amount(inv.amount_due) && !risk, risk };
    }
    async function sourceSub(s: Record<string, unknown>, customerId: string, memberId: string): Promise<{
        source: LegacySource;
        risk: boolean;
    }> {
        memberHint(s, memberId);
        if (id(s.customer, 'cus') !== customerId || !statuses.has(String(s.status)))
            throw new LegacyBillingFailure();
        const { item, entry } = subItem(s), start = sec(item.current_period_start), end = sec(item.current_period_end);
        if (start >= end)
            throw new LegacyBillingFailure();
        const now = Date.now() / 1000;
        const candidateGrant = s.status === 'active' && start <= now && now < end && !s.pause_collection;
        let truth = { paid: false, risk: false };
        // Only a current eligible grant needs invoice grant proof. Definitive
        // cancellation/non-eligibility is not undone by an old proration shape;
        // explicit risk events still map and invalidate their exact source.
        if (candidateGrant) {
            if (s.latest_invoice === null || s.latest_invoice === undefined)
                throw new LegacyBillingFailure();
            truth = await invoiceTruth(id(s.latest_invoice, 'in'), id(s.id, 'sub'), customerId, entry.priceId, start, end);
        }
        return { source: { id: id(s.id, 'sub'), kind: 'subscription', tier: entry.tier, status: String(s.status), paid: candidateGrant && truth.paid, valid: true, periodStart: new Date(start * 1000).toISOString(), periodEnd: new Date(end * 1000).toISOString() }, risk: truth.risk };
    }
    async function sourceLifetime(s: Record<string, unknown>, customerId: string, memberId: string): Promise<{
        source: LegacySource;
        risk: boolean;
    }> {
        sessionHint(s, memberId);
        if (id(s.customer, 'cus') !== customerId || s.mode !== 'payment' || !['open', 'complete', 'expired'].includes(String(s.status)))
            throw new LegacyBillingFailure();
        const entry = sessionItem(s, 'lifetime');
        let truth = { paid: false, risk: false };
        if (s.status === 'complete' && s.payment_status === 'paid') {
            if (s.amount_total !== entry.amount)
                throw new LegacyBillingFailure();
            truth = await intentTruth(id(s.payment_intent, 'pi'), customerId, entry.amount);
        }
        return { source: { id: id(s.id, 'cs'), kind: 'lifetime', tier: 'oracle', status: String(s.status), paid: s.status === 'complete' && s.payment_status === 'paid' && truth.paid, valid: true, periodStart: null, periodEnd: null }, risk: truth.risk };
    }
    async function fromSub(subId: string): Promise<LegacyTarget | null> {
        const s = await retrieveSub(subId), m = rec(s.metadata);
        if (m.type !== 'membership')
            return null;
        const verifiedMemberId = memberHint(s);
        subItem(s);
        const customerId = id(s.customer, 'cus');
        await customerIdentity(customerId, verifiedMemberId ?? undefined);
        return { customerId, verifiedMemberId, invalidatedSourceIds: [] };
    }
    async function fromSession(sessionId: string, current?: Record<string, unknown>): Promise<LegacyTarget | null> {
        const s = current ?? await retrieveSession(sessionId);
        if (rec(s.metadata).type !== 'membership')
            return null;
        const verifiedMemberId = sessionHint(s);
        if (s.mode !== 'payment' && s.mode !== 'subscription')
            throw new LegacyBillingFailure();
        sessionItem(s, s.mode === 'payment' ? 'lifetime' : 'subscription');
        const customerId = id(s.customer, 'cus');
        await customerIdentity(customerId, verifiedMemberId ?? undefined);
        if (s.mode === 'subscription') {
            if (s.subscription === null) {
                if (s.status === 'complete')
                    throw new LegacyBillingFailure();
            }
            else {
                const subTarget = await fromSub(id(s.subscription, 'sub'));
                if (!subTarget || subTarget.customerId !== customerId || (subTarget.verifiedMemberId !== null && verifiedMemberId !== null && subTarget.verifiedMemberId !== verifiedMemberId))
                    throw new LegacyBillingFailure();
                return { ...subTarget, verifiedMemberId: verifiedMemberId ?? subTarget.verifiedMemberId };
            }
        }
        return { customerId, verifiedMemberId, invalidatedSourceIds: [] };
    }
    async function fromInvoice(invoiceId: string): Promise<LegacyTarget | null> {
        const inv = rec(await stripe.invoices.retrieve(invoiceId));
        if (inv.id !== invoiceId)
            throw new LegacyBillingFailure();
        mode(inv);
        if (inv.parent === null)
            return null;
        const p = rec(inv.parent);
        if (p.type !== 'subscription_details')
            return null;
        const target = await fromSub(id(rec(p.subscription_details).subscription, 'sub'));
        if (target && id(inv.customer, 'cus') !== target.customerId)
            throw new LegacyBillingFailure();
        return target;
    }
    return {
        async verifyAccount() {
            const a = rec(await stripe.accounts.retrieveCurrent());
            if (a.id !== c.accountId)
                throw new LegacyBillingFailure();
        },
        async target(event) {
            const o = rec(event.data.object);
            if (event.type.startsWith('checkout.session.'))
                return fromSession(id(o.id, 'cs'));
            if (event.type.startsWith('customer.subscription.'))
                return fromSub(id(o.id, 'sub'));
            if (event.type.startsWith('invoice.'))
                return fromInvoice(id(o.id, 'in'));
            if (['charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created'].includes(event.type)) {
                let chargeId: string;
                if (event.type === 'charge.refunded')
                    chargeId = id(o.id, 'ch');
                else {
                    const raw = rec(event.type === 'charge.dispute.created' ? await stripe.disputes.retrieve(id(o.id, 'dp')) : await stripe.radar.earlyFraudWarnings.retrieve(id(o.id, 'issfr')));
                    mode(raw);
                    if (raw.id !== o.id)
                        throw new LegacyBillingFailure();
                    chargeId = id(raw.charge, 'ch');
                }
                const ch = rec(await stripe.charges.retrieve(chargeId));
                mode(ch);
                if (ch.id !== chargeId)
                    throw new LegacyBillingFailure();
                const customerId = id(ch.customer, 'cus'), piId = ch.payment_intent === null ? null : id(ch.payment_intent, 'pi');
                if (piId) {
                    const intent = rec(await stripe.paymentIntents.retrieve(piId));
                    mode(intent);
                    if (intent.id !== piId || id(intent.customer, 'cus') !== customerId || id(intent.latest_charge, 'ch') !== chargeId)
                        throw new LegacyBillingFailure();
                }
                const found: Array<LegacyTarget & {
                    source: LegacyInvalidation;
                }> = [];
                const listed = await pages(after => stripe.invoicePayments.list({ ...(piId ? { payment: { type: 'payment_intent' as const, payment_intent: piId } } : {}), status: 'paid', limit: 100, ...(after ? { starting_after: after } : {}) }));
                // The current API filters InvoicePayments by PaymentIntent only. Older
                // direct-charge invoices require a complete bounded scan, never a made-up
                // charge filter or an incomplete list interpreted as no affected source.
                const payments = piId ? listed : listed.filter(p => legacyRecord(p.payment) && p.payment.type === 'charge' && id(p.payment.charge, 'ch') === chargeId);
                for (const listedPayment of payments) {
                    mode(listedPayment);
                    const listedReference = rec(listedPayment.payment);
                    if (listedPayment.status !== 'paid' || amount(listedPayment.amount_paid) <= 0
                        || (piId ? listedReference.type !== 'payment_intent' || id(listedReference.payment_intent, 'pi') !== piId
                            : listedReference.type !== 'charge' || id(listedReference.charge, 'ch') !== chargeId))
                        throw new LegacyBillingFailure();
                    const paymentId = id(listedPayment.id, 'inpay');
                    const pay = rec(await stripe.invoicePayments.retrieve(paymentId));
                    mode(pay);
                    const payment = rec(pay.payment);
                    if (pay.id !== paymentId || id(pay.invoice, 'in') !== id(listedPayment.invoice, 'in') || pay.status !== 'paid' || amount(pay.amount_paid) <= 0
                        || (piId ? payment.type !== 'payment_intent' || id(payment.payment_intent, 'pi') !== piId
                            : payment.type !== 'charge' || id(payment.charge, 'ch') !== chargeId))
                        throw new LegacyBillingFailure();
                    const invoiceId = id(pay.invoice, 'in');
                    const inv = rec(await stripe.invoices.retrieve(invoiceId));
                    mode(inv);
                    if (inv.id !== invoiceId || id(inv.customer, 'cus') !== customerId)
                        throw new LegacyBillingFailure();
                    const parent = rec(inv.parent);
                    if (parent.type !== 'subscription_details')
                        continue;
                    const subId = id(rec(parent.subscription_details).subscription, 'sub'), target = await fromSub(subId);
                    if (target)
                        found.push({ ...target, source: { kind: 'subscription', id: subId } });
                }
                if (piId) {
                    const sessions = await pages(after => stripe.checkout.sessions.list({ payment_intent: piId, limit: 100, ...(after ? { starting_after: after } : {}) }));
                    for (const row of sessions) {
                        if (rec(row.metadata).type !== 'membership')
                            continue;
                        if (row.mode !== 'payment' || row.subscription !== null || id(row.payment_intent, 'pi') !== piId || id(row.customer, 'cus') !== customerId)
                            throw new LegacyBillingFailure();
                        const sessionId = id(row.id, 'cs');
                        const session = await retrieveSession(sessionId);
                        if (session.mode !== 'payment' || session.subscription !== null || id(session.payment_intent, 'pi') !== piId || id(session.customer, 'cus') !== customerId)
                            throw new LegacyBillingFailure();
                        const target = await fromSession(sessionId, session);
                        if (target)
                            found.push({ ...target, source: { kind: 'lifetime', id: sessionId } });
                    }
                }
                if (!found.length)
                    return null;
                if (found.some(t => t.customerId !== customerId || t.verifiedMemberId !== found[0].verifiedMemberId) || found.length > 100)
                    throw new LegacyBillingFailure();
                return { customerId, verifiedMemberId: found[0].verifiedMemberId, invalidatedSourceIds: found.map(x => x.source).filter((x, i, a) => a.findIndex(y => y.kind === x.kind && y.id === x.id) === i) };
            }
            return null;
        },
        async customer(customerId, memberId) {
            await customerIdentity(customerId, memberId);
            const sources: LegacySource[] = [], invalidatedSourceIds: LegacyInvalidation[] = [];
            let needsReview = false;
            const subscriptions = await pages(after => stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100, ...(after ? { starting_after: after } : {}) }));
            for (const row of subscriptions) {
                const s = await retrieveSub(id(row.id, 'sub')), m = rec(s.metadata);
                if (m.type !== 'membership') {
                    if (typeof m.type !== 'string' || !m.type.trim())
                        needsReview = true;
                    continue;
                }
                const result = await sourceSub(s, customerId, memberId);
                sources.push(result.source);
                if (result.risk)
                    invalidatedSourceIds.push({ kind: 'subscription', id: result.source.id });
            }
            const sessions = await pages(after => stripe.checkout.sessions.list({ customer: customerId, limit: 100, ...(after ? { starting_after: after } : {}) }));
            for (const row of sessions) {
                if (rec(row.metadata).type !== 'membership')
                    continue;
                const s = await retrieveSession(id(row.id, 'cs'));
                sessionHint(s, memberId);
                if (id(s.customer, 'cus') !== customerId)
                    throw new LegacyBillingFailure();
                if (s.mode === 'subscription') {
                    sessionItem(s, 'subscription');
                    if (s.subscription !== null && s.subscription !== undefined) {
                        const subId = id(s.subscription, 'sub');
                        if (!sources.some(x => x.kind === 'subscription' && x.id === subId))
                            throw new LegacyBillingFailure();
                    }
                    else if (s.status === 'complete')
                        throw new LegacyBillingFailure();
                    continue;
                }
                if (s.mode !== 'payment')
                    throw new LegacyBillingFailure();
                const result = await sourceLifetime(s, customerId, memberId);
                sources.push(result.source);
                if (result.risk)
                    invalidatedSourceIds.push({ kind: 'lifetime', id: result.source.id });
            }
            if (sources.length > 100 || new Set(sources.map(s => s.kind + ':' + s.id)).size !== sources.length)
                throw new LegacyBillingFailure();
            return { customer: { customerId, sources }, invalidatedSourceIds, needsReview };
        },
    };
}
