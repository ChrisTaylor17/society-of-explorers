export type Tier = 'free' | 'member' | 'patron' | 'founding';

const TIER_LEVELS: Record<Tier, number> = { free: 0, member: 1, patron: 2, founding: 3 };

export function hasAccess(memberTier: Tier | string | null | undefined, requiredTier: Tier): boolean {
  const level = TIER_LEVELS[(memberTier || 'free') as Tier] || 0;
  const required = TIER_LEVELS[requiredTier] || 0;
  return level >= required;
}

export function tierLabel(tier: string | null | undefined): string {
  const labels: Record<string, string> = { free: 'FREE', member: 'MEMBER', patron: 'PATRON', founding: 'FOUNDING' };
  return labels[tier || 'free'] || 'FREE';
}
