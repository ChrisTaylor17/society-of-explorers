import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_WORLD_SCAN_UPLOAD_BYTES = 500 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SCAN_TYPES = new Set(['photo', 'lidar', 'photogrammetry', 'video', 'audio']);
const SPACE_UPLOAD_SELECT = 'id, total_scans';
const DUPLICATE_SCAN_SELECT = 'id';
const WORLD_SCAN_UPLOAD_INSERT_SELECT = 'id';

type WorldScanUploadForm = {
  file: File;
  spaceId: string;
  scanType: string;
};

function normalizeUuid(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeScanType(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return 'photo';
  const scanType = value.trim().toLowerCase();
  return ALLOWED_SCAN_TYPES.has(scanType) ? scanType : null;
}

function normalizeFileExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension ? extension.slice(0, 16) : 'bin';
}

function isValidUploadFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0 && value.size <= MAX_WORLD_SCAN_UPLOAD_BYTES;
}

function normalizeWorldScanUploadForm(formData: FormData): WorldScanUploadForm | null {
  const file = formData.get('file');
  const spaceId = normalizeUuid(formData.get('spaceId'));
  const scanType = normalizeScanType(formData.get('scanType'));

  if (!isValidUploadFile(file) || !spaceId || !scanType) return null;

  return { file, spaceId, scanType };
}

function publicWorldScanUploadReceipt(scanId: string, isFirstScan: boolean) {
  return {
    success: true,
    scanId,
    message: 'Scan uploaded successfully.',
    isFirstScan,
  };
}

function worldScanUploadFailure() {
  return privateJson({ error: 'Failed to upload scan' }, { status: 500 });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const uploadForm = normalizeWorldScanUploadForm(formData);

    if (!uploadForm) {
      return privateJson({ error: 'Missing required fields: file, spaceId' }, { status: 400 });
    }

    const { file, spaceId, scanType } = uploadForm;
    const supabaseAdmin = getSupabaseAdmin();
    const scannerId = auth.member.supabase_auth_id || auth.memberId;

    const { data: space, error: spaceError } = await supabaseAdmin
      .from('spaces')
      .select(SPACE_UPLOAD_SELECT)
      .eq('id', spaceId)
      .maybeSingle();

    if (spaceError) return worldScanUploadFailure();
    if (!space) return privateJson({ error: 'Space not found' }, { status: 404 });

    const fileBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const proofHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: duplicate, error: duplicateError } = await supabaseAdmin
      .from('scan_uploads')
      .select(DUPLICATE_SCAN_SELECT)
      .eq('proof_hash', proofHash)
      .maybeSingle();

    if (duplicateError) return worldScanUploadFailure();
    if (duplicate) {
      return privateJson({ error: 'Duplicate scan - this file has already been uploaded' }, { status: 409 });
    }

    const ext = normalizeFileExtension(file.name);
    const filename = `${spaceId}/${scannerId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('world-scans')
      .upload(filename, fileBuffer, { contentType: file.type });

    if (uploadError) {
      return privateJson({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('world-scans')
      .getPublicUrl(filename);

    const isFirstScan = (space.total_scans || 0) === 0;

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
      .select(WORLD_SCAN_UPLOAD_INSERT_SELECT)
      .maybeSingle();

    if (insertError || !scan) {
      return privateJson({ error: 'Failed to record scan' }, { status: 500 });
    }

    const { error: spaceUpdateError } = await supabaseAdmin
      .from('spaces')
      .update({ total_scans: (space.total_scans || 0) + 1 })
      .eq('id', spaceId);

    if (spaceUpdateError) return worldScanUploadFailure();

    return privateJson(publicWorldScanUploadReceipt(scan.id, isFirstScan));
  } catch {
    return worldScanUploadFailure();
  }
}
