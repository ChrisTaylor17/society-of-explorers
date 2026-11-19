import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/ids/uuid';
import { parseActivityQuery, projectPublicActivity, PUBLIC_ACTIVITY_SCHEMA, PUBLIC_ACTIVITY_SELECT } from '@/lib/feed/publicActivity';

export async function GET(req: NextRequest) {
  const input = parseActivityQuery(req.nextUrl.searchParams);
  if (!input) return privateJson({ error: 'Use a valid activity search.' }, { status: 400 });
  try {
    const supabase = getSupabaseAdmin();

    const { data: community, error: communityError } = await supabase
      .from('communities')
      .select('id')
      .eq('slug', input.community)
      .maybeSingle();

    if (communityError) return privateJson({ error: 'Failed to load community feed' }, { status: 500 });
    if (!community) return privateJson({ schema: PUBLIC_ACTIVITY_SCHEMA, events: [] });
    if (!isUuid(community.id)) return privateJson({ error: 'Failed to load community feed' }, { status: 503 });

    let query = supabase
      .from('activity_feed')
      .select(PUBLIC_ACTIVITY_SELECT)
      .eq('community_id', community.id)
      .eq('is_public', true)
      .eq('metadata->public_feed->>version', '1')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(input.limit);

    if (input.before) query = query.lt('created_at', input.before);
    const { data, error } = await query;

    if (error) return privateJson({ error: 'Failed to load community feed' }, { status: 500 });

    if (!Array.isArray(data) || data.length > input.limit) return privateJson({ error: 'Failed to load community feed' }, { status: 503 });
    const events = data.map(row => projectPublicActivity(row, community.id)).filter(row => row !== null);
    return privateJson({ schema: PUBLIC_ACTIVITY_SCHEMA, events });
  } catch {
    return privateJson({ error: 'Community activity is unavailable.' }, { status: 503 });
  }
}
