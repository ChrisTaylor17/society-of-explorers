import { createHash } from 'node:crypto';
export type LegacyMode = 'test' | 'live';
export type LegacyTier = 'seeker' | 'scholar' | 'philosopher' | 'oracle';
export type LegacyCatalogEntry = {
    priceId: string;
    productId: string;
    tier: LegacyTier;
    amount: number;
    currency: 'usd';
    interval: 'month' | null;
};
export type LegacyBillingConfig = {
    mode: LegacyMode;
    accountId: string;
    scope: string;
    key: string;
    catalog: LegacyCatalogEntry[];
    catalogHash: string;
};
export const legacyRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function legacyId(v: unknown, prefix: string): v is string {
    return typeof v === 'string' && v.length <= 200 && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(v);
}
export class LegacyBillingFailure extends Error {
    constructor(public status = 503) {
        super('Legacy billing could not be verified or persisted');
    }
}
/** Dedicated reconciliation authority. Presence never opens the old checkout. */
export function legacyBillingConfig(env: Record<string, string | undefined> = process.env): LegacyBillingConfig | null {
    const mode = env.SOE_LEGACY_BILLING_MODE, accountId = env.SOE_LEGACY_BILLING_ACCOUNT_ID?.trim(), key = env.STRIPE_SECRET_KEY?.trim();
    if ((mode !== 'test' && mode !== 'live') || !accountId || accountId.length > 95 || !/^acct_[A-Za-z0-9]+$/.test(accountId) || !key || !new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(key)
        || (mode === 'live' && env.VERCEL_ENV !== 'production'))
        return null;
    let input: unknown;
    try {
        const raw = env.SOE_LEGACY_BILLING_CATALOG_JSON || '';
        if (Buffer.byteLength(raw, 'utf8') > 32768)
            return null;
        input = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (!Array.isArray(input) || !input.length || input.length > 100)
        return null;
    const catalog: LegacyCatalogEntry[] = [], seen = new Set<string>();
    for (const row of input) {
        if (!legacyRecord(row) || Object.keys(row).sort().join(',') !== 'amount,currency,interval,priceId,productId,tier'
            || !legacyId(row.priceId, 'price') || !legacyId(row.productId, 'prod') || seen.has(row.priceId)
            || typeof row.tier !== 'string' || !['seeker', 'scholar', 'philosopher', 'oracle'].includes(row.tier) || !Number.isSafeInteger(row.amount) || Number(row.amount) <= 0 || Number(row.amount) > 100000000
            || row.currency !== 'usd' || (row.tier === 'oracle' ? row.interval !== null : row.interval !== 'month'))
            return null;
        seen.add(row.priceId);
        catalog.push({ priceId: row.priceId, productId: row.productId, tier: row.tier as LegacyTier, amount: row.amount as number, currency: 'usd', interval: row.interval as 'month' | null });
    }
    catalog.sort((a, b) => a.priceId.localeCompare(b.priceId));
    return { mode, accountId, scope: `${mode}:${accountId}`, key, catalog, catalogHash: createHash('sha256').update(JSON.stringify(catalog)).digest('hex') };
}
