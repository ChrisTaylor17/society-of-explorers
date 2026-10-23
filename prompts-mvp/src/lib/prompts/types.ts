export const PROMPT_CATEGORIES = ["create", "think", "work", "reflect"] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];
export type DiscoveryCategory = "for-you" | PromptCategory;
export type DiscoverySort = "random" | "trending" | "new";
export type AtlasSurface = "discover" | "workspace" | "favorites" | "create" | "community" | "packs";
export type PromptBillingState =
  | "none"
  | "renews"
  | "trial_ends"
  | "access_ends"
  | "attention"
  | "inactive";

export interface PromptRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: PromptCategory;
  prompt_text: string;
  tags: string[];
  usage_count: number;
  is_featured: boolean;
  favorited?: boolean;
  signaled?: boolean;
  favorite_count?: number;
  vote_count?: number;
  momentum?: number;
  created_at?: string;
}

export interface MemberSummary {
  id: string;
  displayName: string;
  email: string | null;
  tier: "free" | "explorer_pro";
  billingState: PromptBillingState;
  canManageBilling: boolean;
  canStartCheckout: boolean;
  currentPeriodEnd: string | null;
  runsUsed: number;
  runsLimit: number | null;
}

export interface StreamMeta {
  runId: string;
  runsUsed: number;
  runsLimit: number | null;
  plan: "free" | "explorer_pro";
}
