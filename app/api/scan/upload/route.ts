import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const spaceId = formData.get('spaceId') as string;
    const scanFormat = (formData.get('scan_format') as string) || (formData.get('scanType') as string) || 'photo';
    const locationName = (formData.get('location_name') as string) || null;

    if (!file || !spaceId) {
      return NextResponse.json({ error: 'Missing required fields: file, spaceId' }, { status: 400 });
    }

    // Verify space exists
    const { data: space } = await supabaseAdmin
      .from('spaces')
      .select('id, total_scans')
      .eq('id', spaceId)
      .single();

    if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

    // Generate SHA-256 proof hash
    const fileBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const proofHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Check for duplicate upload
    const { data: duplicate } = await supabaseAdmin
      .from('scan_uploads')
      .select('id')
      .eq('proof_hash', proofHash)
      .single();

    if (duplicate) {
      return NextResponse.json({ error: 'Duplicate scan — this file has already been uploaded' }, { status: 409 });
    }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop() || 'bin';
    const filename = `${spaceId}/${auth.memberId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('world-scans')
      .upload(filename, fileBuffer, { contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Determine if first scan for this space
    const isFirstScan = (space.total_scans || 0) === 0;

    // Create scan record using actual table column names
    const { data: scanRow, error: insertError } = await supabaseAdmin
      .from('scan_uploads')
      .insert({
        space_id: spaceId,
        scanner_id: auth.member.supabase_auth_id || auth.memberId,
        supabase_path: filename,
        file_size_bytes: file.size,
        proof_hash: proofHash,
        scan_type: scanFormat,
        scan_format: scanFormat,
        is_first_scan: isFirstScan,
        location_name: locationName,
        scan_metadata: JSON.stringify({ originalName: file.name, contentType: file.type }),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Increment space total_scans
    await supabaseAdmin
      .from('spaces')
      .update({ total_scans: (space.total_scans || 0) + 1 })
      .eq('id', spaceId);

    // Trigger auto-scoring
    try {
      fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.societyofexplorers.com'}/api/scan/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId: scanRow.id, apiKey: process.env.SCAN_SCORING_API_KEY }),
      }).catch(() => {});
    } catch {}

    return NextResponse.json({
      success: true,
      scanId: scanRow.id,
      message: 'Scan uploaded successfully. Scoring in progress.',
      scan: scanRow,
      proofHash,
      isFirstScan,
      memberId: auth.memberId,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
