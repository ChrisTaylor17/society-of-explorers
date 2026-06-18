export const PROMPT_CATEGORIES = ["create", "think", "work", "reflect"] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];
export type DiscoveryCategory = "for-you" | PromptCategory;
export type DiscoverySort = "random" | "trending" | "new";
export type AtlasSurface = "discover" | "workspace" | "favorites" | "create" | "community";

export interface PromptRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: PromptCategory;
  prompt_text: string;
  tags: string[];
  usage_count: number;
  created_by: string | null;
  is_featured: boolean;
  favorited?: boolean;
  favorite_count?: number;
  created_at?: string;
}

export interface MemberSummary {
  id: string;
  displayName: string;
  email: string | null;
  tier: "free" | "explorer_pro";
  runsUsed: number;
  runsLimit: number | null;
}

export interface StreamMeta {
  runId: string;
  runsUsed: number;
  runsLimit: number | null;
  plan: "free" | "explorer_pro";
}
