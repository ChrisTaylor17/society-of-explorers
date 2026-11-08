import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PUBLIC_MEMBER_SELECT, parsePublicMemberProfile, type PublicMemberProfile } from '@/lib/members/profile';
import { isPublicExplorerId } from '@/lib/explorer/publicProfile';
import { DIRECTORY_EXPECTED_OWNER_HEADER, DIRECTORY_OWNER_HEADER, DIRECTORY_LIMIT } from '@/lib/members/finder';

const unavailable = (status: number) => privateJson({ error: 'This community directory is unavailable.' }, { status });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function communitySlug(req: NextRequest): string | null {
  const query = req.nextUrl.searchParams;
  if (query.getAll('community').length > 1) return null;
  const slug = query.get('community') ?? 'society-of-explorers';
  return slug.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return unavailable(401);
    const expectedOwner = req.headers.get(DIRECTORY_EXPECTED_OWNER_HEADER);
    if (expectedOwner !== null && expectedOwner.toLowerCase() !== auth.memberId.toLowerCase()) return unavailable(409);
    const slug = communitySlug(req);
    if (!slug) return unavailable(400);
    const db = getSupabaseAdmin();
    const { data: community, error: communityError } = await db.from('communities')
      .select('id').eq('slug', slug).eq('is_active', true).maybeSingle();
    if (communityError) return unavailable(503);
    if (!community) return unavailable(404);
    if (!isPublicExplorerId(community.id)) return unavailable(503);

    // Verify the requester before reading any roster or another profile. Merely
    // being signed in, or supplying a community slug, grants no directory access.
    const { data: requester, error: requesterError } = await db.from('community_members')
      .select('community_id,member_id').eq('community_id', community.id)
      .eq('member_id', auth.memberId).maybeSingle();
    if (requesterError) return unavailable(503);
    if (!requester) return unavailable(403);
    if (requester.member_id !== auth.memberId || requester.community_id !== community.id) return unavailable(503);

    // The validated member FK joins publication eligibility before ORDER/LIMIT.
    // Private members must never consume the published directory's page budget.
    const { data: rows, error: profileError } = await db.from('community_members')
      .select('community_id,member_id,profile:members!community_members_member_id_fkey!inner(' + PUBLIC_MEMBER_SELECT + ')')
      .eq('community_id', community.id).eq('profile.profile_visibility', 'public')
      .order('joined_at', { ascending: false }).limit(DIRECTORY_LIMIT).returns<unknown[]>();
    if (profileError || !Array.isArray(rows) || rows.length > DIRECTORY_LIMIT) return unavailable(503);
    const members: PublicMemberProfile[] = [], seen = new Set<string>();
    for (const row of rows) {
      if (!record(row)) return unavailable(503);
      const profile = parsePublicMemberProfile(row.profile);
      if (!profile || row.community_id !== community.id || row.member_id !== profile.id || seen.has(profile.id)) return unavailable(503);
      seen.add(profile.id); members.push(profile);
    }
    return privateJson({ members }, { headers: { [DIRECTORY_OWNER_HEADER]: auth.memberId.toLowerCase() } });
  } catch {
    return unavailable(503);
  }
}
