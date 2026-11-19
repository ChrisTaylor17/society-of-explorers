import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type DashboardExpEvent = {
  id: string;
  amount: number;
  reason: string;
  metadata: unknown;
  created_at: string;
};

type DashboardScanRow = {
  id: string;
  space_id: string;
  quality_score: number | null;
  verified: boolean;
  is_first_scan: boolean;
  exp_awarded: number;
  created_at: string;
};

type DashboardSpaceRow = {
  id: string;
  name: string;
  city: string | null;
  space_type: string | null;
};

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const memberId = auth.memberId;
  const scannerId = auth.member.supabase_auth_id || memberId;
  const supabase = getSupabaseAdmin();

  // Profile summary
  const { data: profile } = await supabase
    .from('user_profile_summary')
    .select('*')
    .eq('member_id', memberId)
    .single();

  // Pending triggers (delivered but not dismissed)
  const { data: triggers } = await supabase
    .from('proactive_triggers')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'delivered')
    .order('delivered_at', { ascending: false })
    .limit(5);

  // Recent sessions count
  const { count: sessionCount } = await supabase
    .from('user_episodes')
    .select('session_id', { count: 'exact', head: true })
    .eq('member_id', memberId);

  // Last session date
  const { data: lastEpisode } = await supabase
    .from('user_episodes')
    .select('created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Latest verdict
  const { data: latestVerdict } = await supabase
    .from('council_sessions')
    .select('question, public_url_slug, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const [eventsResult, scansResult, salonMessagesResult] = await Promise.all([
    supabase
      .from('exp_events')
      .select('id, amount, reason, metadata, created_at')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('scan_uploads')
      .select('id, space_id, quality_score, verified, is_first_scan, exp_awarded, created_at')
      .eq('scanner_id', scannerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('salon_messages')
      .select('id')
      .eq('member_id', memberId)
      .limit(1),
  ]);

  const scanRows = (scansResult.data || []) as DashboardScanRow[];
  const spaceIds = [...new Set(scanRows.map((scan) => scan.space_id).filter(Boolean))];
  let scans = scanRows.map((scan) => ({
    ...scan,
    space_name: undefined as string | undefined,
    space_city: undefined as string | null | undefined,
    space_type: undefined as string | undefined,
  }));
  let stampSpaces: Array<DashboardSpaceRow & { country: null; slug: string; space_type: string }> = [];

  if (spaceIds.length > 0) {
    const { data: spaces } = await supabase
      .from('spaces')
      .select('id, name, city, space_type')
      .in('id', spaceIds);
    const spaceRows = (spaces || []) as DashboardSpaceRow[];
    const spaceMap = new Map(spaceRows.map((space) => [space.id, space]));

    scans = scanRows.map((scan) => {
      const space = spaceMap.get(scan.space_id);
      return {
        ...scan,
        space_name: space?.name,
        space_city: space?.city,
        space_type: space?.space_type || undefined,
      };
    });
    stampSpaces = spaceRows.map((space) => ({
      ...space,
      country: null,
      slug: '',
      space_type: space.space_type || 'waypoint',
    }));
  }

  return privateJson({
    profile: profile || null,
    triggers: triggers || [],
    sessionCount: sessionCount || 0,
    lastSessionAt: lastEpisode?.created_at || null,
    latestVerdict: latestVerdict || null,
    memberName: auth.member.display_name,
    events: (eventsResult.data || []) as DashboardExpEvent[],
    scans,
    stampSpaces,
    showWelcome: !salonMessagesResult.error && (salonMessagesResult.data || []).length === 0,
  });
}
