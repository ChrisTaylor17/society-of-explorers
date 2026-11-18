export type Tier = 'free' | 'seeker' | 'scholar' | 'philosopher';

const TIER_LEVELS: Record<Tier, number> = { free: 0, seeker: 1, scholar: 2, philosopher: 3 };

export function hasAccess(memberTier: Tier | string | null | undefined, requiredTier: Tier): boolean {
  const level = TIER_LEVELS[(memberTier || 'free') as Tier] || 0;
  const required = TIER_LEVELS[requiredTier] || 0;
  return level >= required;
}

export function tierLabel(tier: string | null | undefined): string {
  const labels: Record<string, string> = { free: 'FREE', seeker: 'SEEKER', scholar: 'SCHOLAR', philosopher: 'PHILOSOPHER' };
  return labels[tier || 'free'] || 'FREE';
}
