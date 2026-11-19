import { createHash } from 'node:crypto';
import { LegacyBillingFailure, legacyBillingConfig, legacyId, legacyRecord } from './legacyBillingConfig';
import { createLegacyBillingProvider, type LegacyEvent, type LegacyInvalidation } from './legacyBillingProvider';
import { legacyApplyEvent, legacyEventState } from './legacyBillingRepository';
export { LegacyBillingFailure } from './legacyBillingConfig';
const types = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired',
    'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed',
    'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required', 'invoice.finalization_failed', 'invoice.updated', 'invoice.voided', 'invoice.marked_uncollectible',
    'charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created']);
/** Dispatch hint only. Fresh provider objects still establish product ownership. */
export function isLegacyBillingCandidate(event: LegacyEvent): boolean {
    if (!types.has(event.type) || !legacyRecord(event.data.object))
        return false;
    const m = legacyRecord(event.data.object.metadata) ? event.data.object.metadata : null;
    if (m?.type === 'soe_supporter_v1' || m?.type === '92b_pledge' || m?.type === 'project_pledge')
        return false;
    return !event.type.startsWith('checkout.session.') || m?.type === 'membership';
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([promise, new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new LegacyBillingFailure()), 15000);
            })]);
    }
    finally {
        clearTimeout(timer);
    }
}
export async function processLegacyBillingEvent(event: LegacyEvent, rawBytes: Uint8Array): Promise<{
    received: true;
    ignored?: string;
}> {
    const c = legacyBillingConfig();
    if (!c)
        throw new LegacyBillingFailure();
    if (!legacyId(event.id, 'evt') || event.livemode !== (c.mode === 'live') || (event.account !== undefined && event.account !== c.accountId) || rawBytes.byteLength > 1000000)
        throw new LegacyBillingFailure();
    if (!isLegacyBillingCandidate(event))
        return { received: true, ignored: 'not_legacy_membership' };
    const p = createLegacyBillingProvider(c);
    await bounded(p.verifyAccount());
    const target = await bounded(p.target(event));
    if (!target)
        return { received: true, ignored: 'not_legacy_membership' };
    const hash = createHash('sha256').update(rawBytes).digest('hex');
    for (let retry = 0; retry < 3; retry++) {
        const state = await legacyEventState(c.scope, target.customerId, target.verifiedMemberId), ids = [...new Set([...state.customers, target.customerId])].sort();
        if (ids.length > 25)
            throw new LegacyBillingFailure();
        const customers = [];
        let needsReview = false;
        const risks: LegacyInvalidation[] = [...target.invalidatedSourceIds];
        // A CAS retry re-fetches every known customer; it never reapplies an old snapshot.
        for (const customerId of ids) {
            const fresh = await bounded(p.customer(customerId, state.memberId));
            if (fresh.customer.customerId !== customerId)
                throw new LegacyBillingFailure();
            customers.push(fresh.customer);
            risks.push(...fresh.invalidatedSourceIds);
            needsReview ||= fresh.needsReview;
        }
        const invalidatedSourceIds = risks.filter((x, i, a) => a.findIndex(y => y.kind === x.kind && y.id === x.id) === i);
        if (customers.reduce((n, c) => n + c.sources.length, 0) > 500 || invalidatedSourceIds.length > 100)
            throw new LegacyBillingFailure();
        try {
            await legacyApplyEvent(c.scope, event.id, hash, state, target.customerId, { customers, invalidatedSourceIds, needsReview });
            return { received: true };
        }
        catch (e) {
            if (!(e instanceof LegacyBillingFailure) || e.status !== 409 || retry === 2)
                throw new LegacyBillingFailure();
        }
    }
    throw new LegacyBillingFailure();
}
