// lib/analytics/events.ts
// First-party funnel events. Shared by the browser helper and /api/events.
// Privacy rules: a fixed list of event names, a fixed list of property keys,
// short string values only, and no emails, names, ids or free text.

export const ANALYTICS_EVENTS = [
  'page_view',
  'cta_click',
  'join_view',
  'tier_select',
  'checkout_start',
  'checkout_redirect',
  'checkout_error',
  'signup_start',
  'checkout_welcome_view',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

const PROP_KEYS = ['tier', 'cta', 'path', 'code', 'source', 'mode'] as const;
type PropKey = (typeof PROP_KEYS)[number];
export type AnalyticsProps = Partial<Record<PropKey, string>>;

const VALUE_PATTERN = /^[a-z0-9_\-/.]{1,64}$/i;
const EMAIL_LIKE = /@|%40/;

export function isAnalyticsEvent(value: unknown): value is AnalyticsEventName {
  return typeof value === 'string' && (ANALYTICS_EVENTS as readonly string[]).includes(value);
}

/** Keeps only allowlisted keys with short, plain values. Paths lose their query string. */
export function sanitizeProps(input: unknown): AnalyticsProps {
  const out: AnalyticsProps = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const record = input as Record<string, unknown>;
  for (const key of PROP_KEYS) {
    let value = record[key];
    if (typeof value !== 'string') continue;
    if (key === 'path') value = value.split(/[?#]/)[0];
    const trimmed = (value as string).trim();
    if (!trimmed || EMAIL_LIKE.test(trimmed) || !VALUE_PATTERN.test(trimmed)) continue;
    out[key] = trimmed.toLowerCase();
  }
  return out;
}
