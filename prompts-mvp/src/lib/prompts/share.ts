import { FALLBACK_PROMPTS } from "@/lib/prompts/catalog";
import type { PromptRecord } from "@/lib/prompts/types";
import { getSupabaseAdmin, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

export interface SharePromptMetadata {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  usage_count: number;
}

export const DEFAULT_SHARE_TITLE = "Prompt Atlas | Society of Explorers";
export const DEFAULT_SHARE_DESCRIPTION = "Find a question worth following.";
export const promptShareSelect = "id, slug, title, description, category, usage_count";

const promptKeyPattern =
  /^[a-z0-9-]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizePromptKey(value: string): string {
  const decoded = safeDecode(value).trim().slice(0, 120).toLowerCase();
  return promptKeyPattern.test(decoded) ? decoded : "";
}

export function isPromptUuid(key: string): boolean {
  return uuidPattern.test(key);
}

export function toShareMetadata(prompt: PromptRecord): SharePromptMetadata {
  return {
    id: prompt.id,
    slug: prompt.slug,
    title: prompt.title,
    description: prompt.description,
    category: prompt.category,
    usage_count: prompt.usage_count,
  };
}

export function findFallbackPromptForShare(key: string): SharePromptMetadata | null {
  const prompt = FALLBACK_PROMPTS.find(
    (item) => item.slug === key || item.id.toLowerCase() === key,
  );
  return prompt ? toShareMetadata(prompt) : null;
}

export async function findPublicPromptForShare(
  rawKey: string,
): Promise<SharePromptMetadata | null> {
  const key = normalizePromptKey(rawKey);
  if (!key) return null;

  const fallbackPrompt = findFallbackPromptForShare(key);
  if (!hasSupabaseAdminConfig()) return fallbackPrompt;

  const admin = getSupabaseAdmin();
  let query = admin
    .from("prompts")
    .select(promptShareSelect)
    .eq("visibility", "public")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString());

  query = isPromptUuid(key) ? query.eq("id", key) : query.eq("slug", key);

  const { data, error } = await query.maybeSingle<SharePromptMetadata>();
  if (error) {
    console.error("[prompts] share metadata query failed", error.message);
    return fallbackPrompt;
  }

  return data ?? fallbackPrompt;
}

export function promptsForShare(key: string): PromptRecord[] {
  const index = FALLBACK_PROMPTS.findIndex(
    (prompt) => prompt.slug === key || prompt.id.toLowerCase() === key,
  );
  if (index < 0) return FALLBACK_PROMPTS;

  const selected = FALLBACK_PROMPTS[index];
  return [selected, ...FALLBACK_PROMPTS.filter((prompt) => prompt.id !== selected.id)];
}
