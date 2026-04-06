import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const spaceId = formData.get('spaceId') as string;
    const scannerId = formData.get('scannerId') as string;
    const scanType = (formData.get('scanType') as string) || 'photo';

    if (!file || !spaceId || !scannerId) {
      return NextResponse.json({ error: 'Missing required fields: file, spaceId, scannerId' }, { status: 400 });
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
    const filename = `${spaceId}/${scannerId}/${Date.now()}.${ext}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('world-scans')
      .upload(filename, fileBuffer, { contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('world-scans')
      .getPublicUrl(filename);

    // Determine if first scan for this space
    const isFirstScan = (space.total_scans || 0) === 0;

    // Create scan record
    const { data: scan, error: insertError } = await supabaseAdmin
      .from('scan_uploads')
      .insert({
        space_id: spaceId,
        scanner_id: scannerId,
        file_url: urlData.publicUrl,
        file_size: file.size,
        proof_hash: proofHash,
        scan_type: scanType,
        is_first_scan: isFirstScan,
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

    return NextResponse.json({ scan, proofHash, isFirstScan });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
