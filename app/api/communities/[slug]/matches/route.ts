import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type CommunityMatchBody = {
  matchId?: string;
  action?: string;
};

type CommunityRow = {
  id: string;
};

type CommunityMatchRow = {
  id: string;
  community_id: string;
  member_a: string;
  member_b: string;
  compatibility_score: number | null;
  status?: string | null;
  [key: string]: unknown;
};

type MemberNameRow = {
  id: string;
  display_name: string | null;
};

function trimmedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isMatchAction(value: unknown): value is 'accept' | 'decline' {
  return value === 'accept' || value === 'decline';
}

function dedupeMatches(matches: CommunityMatchRow[]) {
  const seen = new Set<string>();
  return matches.filter((match) => {
    if (seen.has(match.id)) return false;
    seen.add(match.id);
    return true;
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auth = await getAuthenticatedMember(req);

  if (!auth) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: community } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .single()
    .returns<CommunityRow>();

  if (!community) {
    return privateJson({ error: 'Community not found' }, { status: 404 });
  }

  const [asMemberA, asMemberB] = await Promise.all([
    supabase
      .from('community_matches')
      .select('*')
      .eq('community_id', community.id)
      .eq('member_a', auth.memberId)
      .returns<CommunityMatchRow[]>(),
    supabase
      .from('community_matches')
      .select('*')
      .eq('community_id', community.id)
      .eq('member_b', auth.memberId)
      .returns<CommunityMatchRow[]>(),
  ]);

  const matches = dedupeMatches([...(asMemberA.data || []), ...(asMemberB.data || [])])
    .sort((left, right) => Number(right.compatibility_score || 0) - Number(left.compatibility_score || 0));
  const otherIds = Array.from(
    new Set(matches.map((match) => (match.member_a === auth.memberId ? match.member_b : match.member_a))),
  );

  const { data: members } = otherIds.length > 0
    ? await supabase.from('members').select('id, display_name').in('id', otherIds).returns<MemberNameRow[]>()
    : { data: [] as MemberNameRow[] };
  const nameById = new Map((members || []).map((member) => [member.id, member.display_name] as const));

  const enriched = matches.map((match) => {
    const otherId = match.member_a === auth.memberId ? match.member_b : match.member_a;
    return {
      ...match,
      other_member_id: otherId,
      other_name: nameById.get(otherId) || 'Explorer',
    };
  });

  return privateJson({ matches: enriched });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: CommunityMatchBody;

  try {
    body = (await req.json()) as CommunityMatchBody;
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const matchId = trimmedText(body.matchId);

  if (!matchId || !isMatchAction(body.action)) {
    return privateJson({ error: 'matchId and valid action required' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: community } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .single()
    .returns<CommunityRow>();

  if (!community) {
    return privateJson({ error: 'Community not found' }, { status: 404 });
  }

  const { data: match } = await supabase
    .from('community_matches')
    .select('id, community_id, member_a, member_b, status')
    .eq('id', matchId)
    .eq('community_id', community.id)
    .single()
    .returns<CommunityMatchRow>();

  if (!match) {
    return privateJson({ error: 'Match not found' }, { status: 404 });
  }

  if (match.member_a !== auth.memberId && match.member_b !== auth.memberId) {
    return privateJson({ error: 'Cannot respond to another member match' }, { status: 403 });
  }

  const { error } = await supabase
    .from('community_matches')
    .update({ status: body.action === 'accept' ? 'accepted' : 'declined' })
    .eq('id', matchId)
    .eq('community_id', community.id);

  if (error) {
    return privateJson({ error: 'Failed to update match response' }, { status: 500 });
  }

  return privateJson({ success: true });
}
