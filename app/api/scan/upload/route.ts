import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_SCAN_UPLOAD_BYTES = 500 * 1024 * 1024;
const MAX_LOCATION_NAME_LENGTH = 160;
const MAX_ORIGINAL_NAME_LENGTH = 160;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SCAN_FORMATS = new Set(['usdz', 'obj', 'ply', 'glb', 'gltf', 'splat', 'e57', 'las', 'laz']);
const SPACE_UPLOAD_SELECT = 'id, total_scans';
const DUPLICATE_SCAN_SELECT = 'id';
const SCAN_UPLOAD_INSERT_SELECT = 'id';

type ScanUploadForm = {
  file: File;
  spaceId: string;
  scanFormat: string;
  locationName: string | null;
};

function normalizeUuid(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeOptionalText(value: FormDataEntryValue | null, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeScanFormat(value: FormDataEntryValue | string | null): string | null {
  if (typeof value !== 'string') return null;
  const format = value.trim().toLowerCase().replace(/^\./, '');
  return ALLOWED_SCAN_FORMATS.has(format) ? format : null;
}

function fileExtension(fileName: string): string | null {
  const extension = fileName.split('.').pop();
  return extension ? normalizeScanFormat(extension) : null;
}

function safeOriginalName(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop()?.trim() || 'scan';
  return name.slice(0, MAX_ORIGINAL_NAME_LENGTH);
}

function isValidUploadFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0 && value.size <= MAX_SCAN_UPLOAD_BYTES;
}

function normalizeScanUploadForm(formData: FormData): ScanUploadForm | null {
  const file = formData.get('file');
  const spaceId = normalizeUuid(formData.get('spaceId'));
  if (!isValidUploadFile(file) || !spaceId) return null;

  const scanFormat = normalizeScanFormat(formData.get('scan_format')) || normalizeScanFormat(formData.get('scanType')) || fileExtension(file.name);
  if (!scanFormat) return null;

  return {
    file,
    spaceId,
    scanFormat,
    locationName: normalizeOptionalText(formData.get('location_name'), MAX_LOCATION_NAME_LENGTH),
  };
}

function publicUploadReceipt(scanId: string, isFirstScan: boolean) {
  return {
    success: true,
    scanId,
    message: 'Scan uploaded successfully. Scoring in progress.',
    isFirstScan,
  };
}

function scanUploadFailure() {
  return privateJson({ error: 'Failed to upload scan' }, { status: 500 });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const uploadForm = normalizeScanUploadForm(formData);

    if (!uploadForm) {
      return privateJson({ error: 'Missing required fields: file, spaceId' }, { status: 400 });
    }

    const { file, spaceId, scanFormat, locationName } = uploadForm;
    const supabaseAdmin = getSupabaseAdmin();

    const { data: space, error: spaceError } = await supabaseAdmin
      .from('spaces')
      .select(SPACE_UPLOAD_SELECT)
      .eq('id', spaceId)
      .maybeSingle();

    if (spaceError) return scanUploadFailure();
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

    if (duplicateError) return scanUploadFailure();
    if (duplicate) {
      return privateJson({ error: 'Duplicate scan - this file has already been uploaded' }, { status: 409 });
    }

    const filename = `${spaceId}/${auth.memberId}/${Date.now()}.${scanFormat}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('world-scans')
      .upload(filename, fileBuffer, { contentType: file.type });

    if (uploadError) {
      return privateJson({ error: 'Upload failed' }, { status: 500 });
    }

    const isFirstScan = (space.total_scans || 0) === 0;

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
        scan_metadata: JSON.stringify({
          originalName: safeOriginalName(file.name),
          contentType: normalizeOptionalText(file.type, 100),
        }),
      })
      .select(SCAN_UPLOAD_INSERT_SELECT)
      .maybeSingle();

    if (insertError || !scanRow) {
      return privateJson({ error: 'Failed to record scan' }, { status: 500 });
    }

    const { error: spaceUpdateError } = await supabaseAdmin
      .from('spaces')
      .update({ total_scans: (space.total_scans || 0) + 1 })
      .eq('id', spaceId);

    if (spaceUpdateError) return scanUploadFailure();

    try {
      void fetch(new URL('/api/scan/score', req.nextUrl.origin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId: scanRow.id, apiKey: process.env.SCAN_SCORING_API_KEY }),
      }).catch(() => undefined);
    } catch {}

    return privateJson(publicUploadReceipt(scanRow.id, isFirstScan));
  } catch {
    return scanUploadFailure();
  }
}
