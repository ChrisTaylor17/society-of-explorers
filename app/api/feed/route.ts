import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type CommunityRow = {
  id: string;
};

type ActivityFeedRow = {
  id: string;
  [key: string]: unknown;
};

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value || '30', 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(parsed, 1), 100);
}

export async function GET(req: NextRequest) {
  const communitySlug = req.nextUrl.searchParams.get('community') || 'society-of-explorers';
  const limit = parseLimit(req.nextUrl.searchParams.get('limit'));
  const before = req.nextUrl.searchParams.get('before');
  const supabase = getSupabaseAdmin();

  const { data: community, error: communityError } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', communitySlug)
    .maybeSingle();

  if (communityError) return privateJson({ error: 'Failed to load community feed' }, { status: 500 });
  const communityRow = community as CommunityRow | null;
  if (!communityRow) return privateJson({ events: [] });

  let query = supabase
    .from('activity_feed')
    .select('*')
    .eq('community_id', communityRow.id)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;

  if (error) return privateJson({ error: 'Failed to load community feed' }, { status: 500 });

  return privateJson({ events: (data || []) as ActivityFeedRow[] });
}
