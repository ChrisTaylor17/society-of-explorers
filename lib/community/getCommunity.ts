import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface CommunityThinker {
  thinker_key: string;
  name: string;
  avatar: string;
  color: string;
  mandate: string;
  persona_lens: string;
  sort_order: number;
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  branding: Record<string, any>;
  theme: string;
  logo_url: string | null;
  hero_image_url: string | null;
  is_public: boolean;
  council_max_tokens: number;
  onboarding_questions: any[];
  thinkers: CommunityThinker[];
}

const DEFAULT_SLUG = 'society-of-explorers';
const cache = new Map<string, { data: Community; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function getCommunity(slug?: string): Promise<Community | null> {
  const resolvedSlug = slug || DEFAULT_SLUG;

  const cached = cache.get(resolvedSlug);
  if (cached && cached.expires > Date.now()) return cached.data;

  const { data: community } = await supabase
    .from('communities')
    .select('*')
    .eq('slug', resolvedSlug)
    .eq('is_active', true)
    .single();

  if (!community) return null;

  const { data: thinkers } = await supabase
    .from('community_thinkers')
    .select('thinker_key, name, avatar, color, mandate, persona_lens, sort_order')
    .eq('community_id', community.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  const result: Community = {
    ...community,
    branding: community.branding || {},
    thinkers: thinkers || [],
  };

  cache.set(resolvedSlug, { data: result, expires: Date.now() + CACHE_TTL });
  return result;
}

export async function getCommunityThinkerPrompts(slug?: string): Promise<Record<string, string>> {
  const community = await getCommunity(slug);
  if (!community || community.thinkers.length === 0) return {};
  const prompts: Record<string, string> = {};
  for (const t of community.thinkers) {
    prompts[t.thinker_key] = t.mandate;
  }
  return prompts;
}

export async function getCommunityThinkerLenses(slug?: string): Promise<Record<string, string>> {
  const community = await getCommunity(slug);
  if (!community || community.thinkers.length === 0) return {};
  const lenses: Record<string, string> = {};
  for (const t of community.thinkers) {
    lenses[t.thinker_key] = t.persona_lens;
  }
  return lenses;
}

export async function getMemberCommunities(memberId: string): Promise<Community[]> {
  const { data: memberships } = await supabase
    .from('community_members')
    .select('community_id')
    .eq('member_id', memberId);

  const communities: Community[] = [];

  if (memberships && memberships.length > 0) {
    for (const m of memberships) {
      const { data: c } = await supabase.from('communities').select('slug').eq('id', m.community_id).single();
      if (c) {
        const full = await getCommunity(c.slug);
        if (full) communities.push(full);
      }
    }
  }

  if (!communities.find(c => c.slug === DEFAULT_SLUG)) {
    const soe = await getCommunity(DEFAULT_SLUG);
    if (soe) communities.unshift(soe);
  }

  return communities;
}
