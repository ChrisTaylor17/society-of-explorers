import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { calculateScanReward } from '@/lib/world/types';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scanId, qualityScore, notes, apiKey } = body;

    // Allow either authenticated member or API key for auto-scoring
    let reviewerId: string | null = null;

    if (apiKey && apiKey === process.env.SCAN_SCORING_API_KEY) {
      reviewerId = 'system';
    } else {
      const auth = await getAuthenticatedMember(req);
      if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      reviewerId = auth.member.supabase_auth_id || auth.memberId;
    }

    if (!scanId) {
      return NextResponse.json({ error: 'Missing required field: scanId' }, { status: 400 });
    }

    // For auto-scoring, generate a score if none provided
    const score = qualityScore !== undefined ? qualityScore : Math.floor(40 + Math.random() * 55);

    if (score < 0 || score > 100) {
      return NextResponse.json({ error: 'Quality score must be 0-100' }, { status: 400 });
    }

    // Fetch the scan with its space
    const { data: scan } = await supabaseAdmin
      .from('scan_uploads')
      .select('*, spaces!inner(host_id)')
      .eq('id', scanId)
      .single();

    if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    if (scan.verified) return NextResponse.json({ error: 'Scan already scored' }, { status: 409 });

    // Host check only for non-system callers
    if (reviewerId !== 'system') {
      const hostId = (scan as any).spaces.host_id;
      if (hostId !== reviewerId) {
        return NextResponse.json({ error: 'Only the space host can score scans' }, { status: 403 });
      }
    }

    // Log quality review
    await supabaseAdmin.from('scan_quality_log').insert({
      scan_id: scanId,
      reviewer_id: reviewerId,
      quality_score: score,
      notes: notes || null,
    });

    // Count scanner's lifetime verified scans for reputation bonus
    const { count: lifetimeScans } = await supabaseAdmin
      .from('scan_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('scanner_id', scan.scanner_id)
      .eq('verified', true);

    // Calculate reward
    const expAmount = calculateScanReward(score, scan.is_first_scan, lifetimeScans || 0);

    // Update scan record with actual column names
    await supabaseAdmin
      .from('scan_uploads')
      .update({
        quality_score: score,
        verified: true,
        verified_by: reviewerId,
        verified_at: new Date().toISOString(),
        reward_exp: expAmount,
        status: 'scored',
      })
      .eq('id', scanId);

    // Update space avg_quality
    const { data: spaceScans } = await supabaseAdmin
      .from('scan_uploads')
      .select('quality_score')
      .eq('space_id', scan.space_id)
      .eq('verified', true)
      .not('quality_score', 'is', null);

    if (spaceScans && spaceScans.length > 0) {
      const avg = spaceScans.reduce((sum, s) => sum + (s.quality_score || 0), 0) / spaceScans.length;
      await supabaseAdmin.from('spaces').update({ avg_quality: Math.round(avg * 10) / 10 }).eq('id', scan.space_id);
    }

    // Award EXP: read current total then write new total
    if (expAmount > 0) {
      const { data: scannerMember } = await supabaseAdmin
        .from('members')
        .select('id, exp_tokens')
        .or(`supabase_auth_id.eq.${scan.scanner_id},id.eq.${scan.scanner_id}`)
        .single();

      if (scannerMember) {
        await supabaseAdmin.from('exp_events').insert({
          member_id: scannerMember.id,
          amount: expAmount,
          reason: 'scan_verified',
          metadata: JSON.stringify({
            scanId,
            spaceId: scan.space_id,
            qualityScore: score,
            isFirstScan: scan.is_first_scan,
          }),
        });

        const newTotal = (scannerMember.exp_tokens || 0) + expAmount;
        await supabaseAdmin
          .from('members')
          .update({ exp_tokens: newTotal })
          .eq('id', scannerMember.id);
      }
    }

    return NextResponse.json({
      success: true,
      qualityScore: score,
      expAwarded: expAmount,
      isFirstScan: scan.is_first_scan,
      lifetimeScans: (lifetimeScans || 0) + 1,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
