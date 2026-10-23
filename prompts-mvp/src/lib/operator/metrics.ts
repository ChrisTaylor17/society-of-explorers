export interface PromptAtlasOperatorMetrics {
  generatedAt: string;
  monthStart: string;
  nextMonthStart: string;
  activatedMembers: number;
  activeExplorers: number;
  paidActiveSubscriptions: number;
  trialingSubscriptions: number;
  scheduledCancellations: number;
  recoverySubscriptions: number;
  restartableSubscriptions: number;
  freeLimitMembers: number;
  completedRuns: number;
  providerStartedRuns: number;
  inputTokens: number;
  outputTokens: number;
  estimatedModelCostCents: number;
  subscriptionRunRateCents: number;
  estimatedMtdSubscriptionRevenueCents: number;
  estimatedModelContributionCents: number;
  paidConversionPercent: number;
}

const numericKeys = [
  "activatedMembers",
  "activeExplorers",
  "paidActiveSubscriptions",
  "trialingSubscriptions",
  "scheduledCancellations",
  "recoverySubscriptions",
  "restartableSubscriptions",
  "freeLimitMembers",
  "completedRuns",
  "providerStartedRuns",
  "inputTokens",
  "outputTokens",
  "estimatedModelCostCents",
  "subscriptionRunRateCents",
  "estimatedMtdSubscriptionRevenueCents",
  "estimatedModelContributionCents",
  "paidConversionPercent",
] as const;

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

export function normalizePromptAtlasOperatorMetrics(
  value: unknown,
): PromptAtlasOperatorMetrics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (
    !validTimestamp(candidate.generatedAt) ||
    !validTimestamp(candidate.monthStart) ||
    !validTimestamp(candidate.nextMonthStart)
  ) {
    return null;
  }

  const normalized = {} as Record<(typeof numericKeys)[number], number>;
  for (const key of numericKeys) {
    const numberValue = Number(candidate[key]);
    if (!Number.isFinite(numberValue)) return null;
    normalized[key] = numberValue;
  }

  return {
    generatedAt: candidate.generatedAt,
    monthStart: candidate.monthStart,
    nextMonthStart: candidate.nextMonthStart,
    ...normalized,
  };
}
