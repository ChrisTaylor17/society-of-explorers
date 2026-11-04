import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/ids/uuid';
import { LegacyBillingFailure, legacyId, legacyRecord } from './legacyBillingConfig';
import type { LegacySnapshot } from './legacyBillingProvider';
export type LegacyEventState = {
    memberId: string;
    revision: number;
    expectedTier: string | null;
    baselineTier: string | null;
    needsReview: boolean;
    externalChange: boolean;
    customers: string[];
    otherLiveScopes: boolean;
};
export type LegacyApplyResult = {
    memberId: string;
    revision: number;
    tier: string | null;
    tierWritten: boolean;
    needsReview: boolean;
    replayed: boolean;
};
const revision = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const tier = (v: unknown): v is string | null => v === null || (typeof v === 'string' && v.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(v));
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
        const { data, error } = await getSupabaseAdmin().rpc(name, args);
        if (error)
            throw new LegacyBillingFailure(legacyRecord(error) && error.code === 'PT409' ? 409 : 503);
        return data;
    }
    catch (e) {
        if (e instanceof LegacyBillingFailure)
            throw e;
        throw new LegacyBillingFailure();
    }
}
export async function legacyEventState(scope: string, customerId: string, verifiedMemberId: string | null): Promise<LegacyEventState> {
    const v = await rpc('soe_legacy_billing_event_state', { p_scope: scope, p_customer_id: customerId, p_verified_member_id: verifiedMemberId });
    if (!legacyRecord(v) || !isUuid(v.memberId) || !revision(v.revision) || !tier(v.expectedTier) || !tier(v.baselineTier) || typeof v.needsReview !== 'boolean' || typeof v.externalChange !== 'boolean' || typeof v.otherLiveScopes !== 'boolean'
        || !Array.isArray(v.customers) || v.customers.length > 25 || v.customers.some(x => !legacyId(x, 'cus')) || new Set(v.customers).size !== v.customers.length)
        throw new LegacyBillingFailure();
    if (verifiedMemberId !== null && v.memberId !== verifiedMemberId)
        throw new LegacyBillingFailure();
    return { memberId: v.memberId, revision: v.revision, expectedTier: v.expectedTier, baselineTier: v.baselineTier, needsReview: v.needsReview, externalChange: v.externalChange, customers: v.customers as string[], otherLiveScopes: v.otherLiveScopes };
}
export async function legacyApplyEvent(scope: string, eventId: string, payloadHash: string, state: LegacyEventState, customerId: string, snapshot: LegacySnapshot): Promise<LegacyApplyResult> {
    const v = await rpc('soe_legacy_billing_apply_event', { p_scope: scope, p_event_id: eventId, p_payload_hash: payloadHash, p_member_id: state.memberId, p_customer_id: customerId, p_expected_revision: state.revision, p_expected_tier: state.expectedTier, p_snapshot: snapshot });
    if (!legacyRecord(v) || v.memberId !== state.memberId || !revision(v.revision) || !tier(v.tier) || typeof v.tierWritten !== 'boolean' || typeof v.needsReview !== 'boolean' || typeof v.replayed !== 'boolean')
        throw new LegacyBillingFailure();
    return { memberId: v.memberId, revision: v.revision, tier: v.tier, tierWritten: v.tierWritten, needsReview: v.needsReview, replayed: v.replayed };
}
