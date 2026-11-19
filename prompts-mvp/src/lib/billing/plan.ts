export const PROMPT_ATLAS_PRO_MONTHLY_USD = 12;
export const PROMPT_ATLAS_PRO_MONTHLY_CENTS = PROMPT_ATLAS_PRO_MONTHLY_USD * 100;
export const PROMPT_ATLAS_PRO_CURRENCY = "usd";
export const PROMPT_ATLAS_PRO_INTERVAL = "month";
export const PROMPT_ATLAS_PRO_INTERVAL_COUNT = 1;
export const PROMPT_ATLAS_FREE_MONTHLY_RUNS = 5;
export const PROMPT_ATLAS_PRO_MONTHLY_RUNS: number | null = null;
export const PROMPT_ATLAS_PRO_MONTHLY_RUNS_LABEL = "Unlimited";
export const PROMPT_ATLAS_HOURLY_RUNS = 10;
export const PROMPT_ATLAS_MAX_INPUT_TOKENS = 4000;
export const PROMPT_ATLAS_MAX_OUTPUT_TOKENS = 1400;

export const PROMPT_ATLAS_CHECKOUT_BLOCKING_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
] as const;

export function promptAtlasSubscriptionBlocksCheckout(
  status: string | null | undefined,
): boolean {
  return Boolean(
    status &&
      PROMPT_ATLAS_CHECKOUT_BLOCKING_STATUSES.includes(
        status as (typeof PROMPT_ATLAS_CHECKOUT_BLOCKING_STATUSES)[number],
      ),
  );
}
