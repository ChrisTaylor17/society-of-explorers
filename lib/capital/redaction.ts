export type CapitalRedactionPattern = {
  id: string;
  label: string;
  pattern: RegExp;
  replacement: string;
};

export const CAPITAL_REDACTION_PATTERNS: CapitalRedactionPattern[] = [
  {
    id: 'email',
    label: 'email address',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[redacted-email]',
  },
  {
    id: 'phone',
    label: 'phone number',
    pattern: /\b(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g,
    replacement: '[redacted-phone]',
  },
  {
    id: 'wallet',
    label: 'wallet address',
    pattern: /\b0x[a-fA-F0-9]{40}\b/g,
    replacement: '[redacted-wallet]',
  },
  {
    id: 'stripe',
    label: 'Stripe identifier',
    pattern: /\b(?:cs_(?:test|live)|cus|pi|pm|ch|sub|price|prod)_[A-Za-z0-9]{8,}\b/g,
    replacement: '[redacted-stripe-id]',
  },
];

const SAFE_LEAD_LABEL_WORDS = new Set([
  'advisor',
  'architect',
  'artist',
  'believer',
  'boston',
  'builder',
  'candidate',
  'community',
  'creator',
  'founder',
  'friend',
  'intro',
  'lead',
  'local',
  'member',
  'operator',
  'partner',
  'past',
  'patron',
  'philosopher',
  'sponsor',
  'studio',
  'supporter',
  'team',
  'warm',
]);

export function redactCapitalText(value: unknown, fallback = ''): string {
  let text = String(value ?? fallback).trim();

  for (const item of CAPITAL_REDACTION_PATTERNS) {
    item.pattern.lastIndex = 0;
    text = text.replace(item.pattern, item.replacement);
  }

  return text.replace(/[ \t]{3,}/g, '  ');
}

function looksLikeRawFullName(value: string): boolean {
  const normalized = value.replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = normalized.split(' ').filter(Boolean);

  if (words.length < 2 || words.length > 4) return false;
  if (/[0-9@[\]_:()/]/.test(normalized)) return false;

  const nameLike = words.every((word) => /^[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?$/.test(word));
  if (!nameLike) return false;

  return !words.some((word) => SAFE_LEAD_LABEL_WORDS.has(word.toLowerCase()));
}

export function sanitizeCapitalLeadLabel(value: unknown, fallback = 'Private lead'): string {
  const redacted = redactCapitalText(value, fallback).slice(0, 96).trim();
  if (!redacted) return fallback;
  if (/^\[redacted-[a-z-]+\]$/i.test(redacted)) return fallback;
  if (looksLikeRawFullName(redacted)) return fallback;
  return redacted;
}

export function hasCapitalPrivateIdentifier(value: unknown): boolean {
  const text = String(value ?? '');
  return CAPITAL_REDACTION_PATTERNS.some((item) => {
    item.pattern.lastIndex = 0;
    return item.pattern.test(text);
  });
}
