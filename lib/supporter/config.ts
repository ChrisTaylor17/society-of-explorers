import { createHash } from 'node:crypto';
import { SUPPORTER_OFFER_ID, SUPPORTER_TERMS_VERSION, type SupporterMode, type SupporterOffer } from './contracts';
export type SupporterConfig = { mode: SupporterMode; accountId: string; scope: string; key: string; webhookSecret: string | null; priceId: string | null; productId: string | null; portalConfigurationId: string | null; origin: string; salesEnabled: boolean; configHash: string };
type Env = Record<string, string | undefined>;
export function supporterConfig(env: Env = process.env): SupporterConfig | null {
  const mode = env.SOE_SUPPORTER_MODE, key = env.SOE_SUPPORTER_STRIPE_SECRET_KEY?.trim(), accountId = env.SOE_SUPPORTER_ACCOUNT_ID?.trim();
  if (!['test','live'].includes(String(mode)) || !key || !new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(key) || !accountId || !/^acct_[A-Za-z0-9]+$/.test(accountId)
    || (mode === 'live' && env.VERCEL_ENV !== 'production')) return null;
  let origin: string;
  try { const u = new URL(env.SOE_SUPPORTER_SITE_ORIGIN || '');
    const local = ['localhost','0.0.0.0','[::1]','[::]'].includes(u.hostname) || /^127\./.test(u.hostname) || u.hostname.endsWith('.localhost');
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || (mode === 'live' && local)
      || (u.protocol !== 'https:' && !(mode === 'test' && u.protocol === 'http:' && local))) return null;
    origin = u.origin;
  } catch { return null; }
  const id = (name: string, prefix: string) => { const v = env[name]?.trim(); return v && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(v) ? v : null; };
  const priceId = id('SOE_SUPPORTER_PRICE_ID','price'), productId = id('SOE_SUPPORTER_PRODUCT_ID','prod'), portalConfigurationId = id('SOE_SUPPORTER_PORTAL_CONFIGURATION_ID','bpc');
  const scope = `${mode}:${accountId}`;
  const configHash = createHash('sha256').update(JSON.stringify({ scope, origin, priceId, productId, portalConfigurationId, offerId: SUPPORTER_OFFER_ID, termsVersion: SUPPORTER_TERMS_VERSION })).digest('hex');
  return { mode: mode as SupporterMode, accountId, scope, key, webhookSecret: env.SOE_SUPPORTER_WEBHOOK_SECRET?.trim() || null, priceId, productId, portalConfigurationId, origin,
    salesEnabled: env.SOE_SUPPORTER_SALES_ENABLED === 'true', configHash };
}
export function supporterOffer(config: SupporterConfig | null): SupporterOffer {
  return { offerId: SUPPORTER_OFFER_ID, termsVersion: SUPPORTER_TERMS_VERSION, amount: 1000, currency: 'usd', interval: 'month',
    salesOpen: Boolean(config?.salesEnabled && config.priceId && config.productId && config.webhookSecret && config.portalConfigurationId),
    managementAvailable: Boolean(config?.portalConfigurationId), mode: config?.mode ?? null };
}
export function providerIdempotency(config: SupporterConfig, accountId: string, requestId: string, stage: string): string {
  return 'soe-supporter-' + createHash('sha256').update(JSON.stringify([config.scope, accountId, requestId, stage])).digest('hex');
}
