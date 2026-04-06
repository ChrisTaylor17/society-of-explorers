import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateScanReward } from '@/lib/world/types';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { scanId, reviewerId, qualityScore, notes, memberId } = await req.json();

    if (!scanId || !reviewerId || qualityScore === undefined || !memberId) {
      return NextResponse.json({ error: 'Missing required fields: scanId, reviewerId, qualityScore, memberId' }, { status: 400 });
    }

    if (qualityScore < 0 || qualityScore > 100) {
      return NextResponse.json({ error: 'Quality score must be 0-100' }, { status: 400 });
    }

    // Fetch the scan
    const { data: scan } = await supabaseAdmin
      .from('scan_uploads')
      .select('*, spaces!inner(host_id)')
      .eq('id', scanId)
      .single();

    if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    if (scan.verified) return NextResponse.json({ error: 'Scan already verified' }, { status: 409 });

    // Only the space host can verify
    if ((scan as any).spaces.host_id !== reviewerId) {
      return NextResponse.json({ error: 'Only the space host can verify scans' }, { status: 403 });
    }

    // Log quality review
    await supabaseAdmin.from('scan_quality_log').insert({
      scan_id: scanId,
      reviewer_id: reviewerId,
      quality_score: qualityScore,
      notes: notes || null,
    });

    // Count scanner's lifetime scans for reputation bonus
    const { count: lifetimeScans } = await supabaseAdmin
      .from('scan_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('scanner_id', scan.scanner_id)
      .eq('verified', true);

    // Calculate reward
    const expAmount = calculateScanReward(qualityScore, scan.is_first_scan, lifetimeScans || 0);

    // Update scan record
    await supabaseAdmin
      .from('scan_uploads')
      .update({
        quality_score: qualityScore,
        verified: true,
        verified_by: reviewerId,
        verified_at: new Date().toISOString(),
        exp_awarded: expAmount,
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

    // Award EXP to scanner via exp_events + member update
    if (expAmount > 0 && memberId) {
      await supabaseAdmin.from('exp_events').insert({
        member_id: memberId,
        amount: expAmount,
        reason: 'scan_verified',
        metadata: JSON.stringify({ scanId, spaceId: scan.space_id, qualityScore, isFirstScan: scan.is_first_scan }),
      });

      const { data: member } = await supabaseAdmin
        .from('members')
        .select('exp_tokens')
        .eq('id', memberId)
        .single();

      const newTotal = (member?.exp_tokens || 0) + expAmount;
      await supabaseAdmin.from('members').update({ exp_tokens: newTotal }).eq('id', memberId);
    }

    return NextResponse.json({
      success: true,
      qualityScore,
      expAwarded: expAmount,
      isFirstScan: scan.is_first_scan,
      lifetimeScans: (lifetimeScans || 0) + 1,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
