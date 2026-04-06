import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;
    const status = searchParams.get('status'); // 'verified', 'pending', or null for all

    // Build query for scans by this member
    const scannerId = auth.member.supabase_auth_id || auth.memberId;
    let query = supabaseAdmin
      .from('scan_uploads')
      .select('id, space_id, file_url, file_size, proof_hash, scan_type, quality_score, verified, verified_at, exp_awarded, is_first_scan, created_at', { count: 'exact' })
      .or(`scanner_id.eq.${scannerId},scanner_id.eq.${auth.memberId}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status === 'verified') query = query.eq('verified', true);
    else if (status === 'pending') query = query.eq('verified', false);

    const { data: scans, count, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch space names for enrichment
    const spaceIds = [...new Set((scans || []).map(s => s.space_id))];
    let spaces: Record<string, { name: string; city: string | null; space_type: string }> = {};

    if (spaceIds.length > 0) {
      const { data: spaceRows } = await supabaseAdmin
        .from('spaces')
        .select('id, name, city, space_type')
        .in('id', spaceIds);

      if (spaceRows) {
        for (const sp of spaceRows) {
          spaces[sp.id] = { name: sp.name, city: sp.city, space_type: sp.space_type };
        }
      }
    }

    const enriched = (scans || []).map(scan => ({
      ...scan,
      space: spaces[scan.space_id] || null,
    }));

    // Aggregate stats
    const totalExp = (scans || []).reduce((sum, s) => sum + (s.exp_awarded || 0), 0);
    const verifiedCount = (scans || []).filter(s => s.verified).length;

    return NextResponse.json({
      scans: enriched,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      stats: {
        totalScans: count || 0,
        verifiedScans: verifiedCount,
        pendingScans: (count || 0) - verifiedCount,
        totalExpEarned: totalExp,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
