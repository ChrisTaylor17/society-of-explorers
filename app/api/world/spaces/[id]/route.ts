import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_SPACE_UPDATE_BODY_LENGTH = 8192;
const MAX_SPACE_NAME_LENGTH = 120;
const MAX_SPACE_DESCRIPTION_LENGTH = 1000;
const MAX_SPACE_LOCATION_LENGTH = 160;
const MAX_SPACE_URL_LENGTH = 2048;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SPACE_STATUSES = new Set(['active', 'archived', 'pending']);
const SPACE_DETAIL_SELECT = 'id, name, slug, description, address, city, country, lat, lng, space_type, status, cover_url, total_scans, avg_quality, created_at, updated_at';
const HOST_SPACE_SELECT = 'id, host_id';
const SCAN_DETAIL_SELECT = 'id, scan_type, quality_score, verified, exp_awarded, is_first_scan, created_at';
const ANNOTATION_DETAIL_SELECT = 'id, content, annotation_type, position_x, position_y, position_z, exp_awarded, created_at';
const SCAN_ID_SELECT = 'id';

type SpaceStatus = 'active' | 'archived' | 'pending';
type SpaceType = 'salon' | 'library' | 'temple' | 'garden' | 'waypoint' | 'outpost';
type AnnotationType = 'note' | 'insight' | 'question' | 'story' | 'warning' | 'ritual';

type SpaceHostRow = {
  id: string;
  host_id: string | null;
};

type SpaceDetailRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  space_type: SpaceType;
  status: SpaceStatus;
  cover_url: string | null;
  total_scans: number | null;
  avg_quality: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type ScanDetailRow = {
  id: string;
  scan_type: string;
  quality_score: number | null;
  verified: boolean | null;
  exp_awarded: number | null;
  is_first_scan: boolean | null;
  created_at: string | null;
};

type AnnotationDetailRow = {
  id: string;
  content: string;
  annotation_type: AnnotationType;
  position_x: number | null;
  position_y: number | null;
  position_z: number | null;
  exp_awarded: number | null;
  created_at: string | null;
};

type ScanIdRow = {
  id: string;
};

type SpaceUpdates = Record<string, string | number | null>;

type NormalizedSpaceUpdate = {
  updates: SpaceUpdates;
  invalidFields: boolean;
};

function isSpaceHost(hostId: string | null | undefined, auth: { memberId: string; member: { supabase_auth_id: string | null } }) {
  return Boolean(hostId && (hostId === auth.memberId || hostId === auth.member.supabase_auth_id));
}

async function safeRequestJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  const rawBody = await req.text();
  if (!rawBody || rawBody.length > MAX_SPACE_UPDATE_BODY_LENGTH) return null;

  try {
    const parsedBody = JSON.parse(rawBody);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return null;
    return parsedBody as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function hasField(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function hasPresentValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && !value.trim()) return false;
  return true;
}

function normalizeRequiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeNullableText(value: unknown, maxLength: number): string | null | undefined {
  if (!hasPresentValue(value)) return null;
  if (typeof value !== 'string') return undefined;
  return value.trim().slice(0, maxLength);
}

function normalizeNullableCoordinate(value: unknown, min: number, max: number): number | null | undefined {
  if (!hasPresentValue(value)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value >= min && value <= max ? value : undefined;
}

function normalizeNullableUrl(value: unknown): string | null | undefined {
  const rawUrl = normalizeNullableText(value, MAX_SPACE_URL_LENGTH);
  if (rawUrl === null || rawUrl === undefined) return rawUrl;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString().slice(0, MAX_SPACE_URL_LENGTH);
  } catch {
    return undefined;
  }
}

function normalizeStatus(value: unknown): SpaceStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const status = value.trim().toLowerCase();
  return ALLOWED_SPACE_STATUSES.has(status) ? (status as SpaceStatus) : undefined;
}

function assignOptionalTextUpdate(updates: SpaceUpdates, body: Record<string, unknown>, inputKey: string, outputKey: string, maxLength: number): boolean {
  if (!hasField(body, inputKey)) return false;
  const value = normalizeNullableText(body[inputKey], maxLength);
  if (value === undefined) return true;
  updates[outputKey] = value;
  return false;
}

function assignOptionalCoordinateUpdate(updates: SpaceUpdates, body: Record<string, unknown>, inputKey: string, outputKey: string, min: number, max: number): boolean {
  if (!hasField(body, inputKey)) return false;
  const value = normalizeNullableCoordinate(body[inputKey], min, max);
  if (value === undefined) return true;
  updates[outputKey] = value;
  return false;
}

function normalizeSpaceUpdateBody(body: Record<string, unknown> | null): NormalizedSpaceUpdate | null {
  if (!body) return null;

  const updates: SpaceUpdates = {};
  let invalidFields = false;

  if (hasField(body, 'name')) {
    const name = normalizeRequiredText(body.name, MAX_SPACE_NAME_LENGTH);
    if (!name) invalidFields = true;
    else updates.name = name;
  }

  invalidFields = assignOptionalTextUpdate(updates, body, 'description', 'description', MAX_SPACE_DESCRIPTION_LENGTH) || invalidFields;
  invalidFields = assignOptionalTextUpdate(updates, body, 'address', 'address', MAX_SPACE_LOCATION_LENGTH) || invalidFields;
  invalidFields = assignOptionalTextUpdate(updates, body, 'city', 'city', MAX_SPACE_LOCATION_LENGTH) || invalidFields;
  invalidFields = assignOptionalTextUpdate(updates, body, 'country', 'country', MAX_SPACE_LOCATION_LENGTH) || invalidFields;
  invalidFields = assignOptionalCoordinateUpdate(updates, body, 'lat', 'lat', -90, 90) || invalidFields;
  invalidFields = assignOptionalCoordinateUpdate(updates, body, 'lng', 'lng', -180, 180) || invalidFields;

  if (hasField(body, 'status')) {
    const status = normalizeStatus(body.status);
    if (!status) invalidFields = true;
    else updates.status = status;
  }

  if (hasField(body, 'coverUrl')) {
    const coverUrl = normalizeNullableUrl(body.coverUrl);
    if (coverUrl === undefined) invalidFields = true;
    else updates.cover_url = coverUrl;
  }

  return { updates, invalidFields };
}

function publicSpaceDetail(space: SpaceDetailRow) {
  return {
    id: space.id,
    name: space.name,
    slug: space.slug,
    description: space.description,
    address: space.address,
    city: space.city,
    country: space.country,
    lat: space.lat,
    lng: space.lng,
    space_type: space.space_type,
    status: space.status,
    cover_url: space.cover_url,
    total_scans: space.total_scans || 0,
    avg_quality: space.avg_quality || 0,
    created_at: space.created_at,
    updated_at: space.updated_at,
  };
}

function publicScanDetail(scan: ScanDetailRow) {
  return {
    id: scan.id,
    scan_type: scan.scan_type,
    quality_score: scan.quality_score,
    verified: Boolean(scan.verified),
    exp_awarded: scan.exp_awarded || 0,
    is_first_scan: Boolean(scan.is_first_scan),
    created_at: scan.created_at,
  };
}

function publicAnnotationDetail(annotation: AnnotationDetailRow) {
  return {
    id: annotation.id,
    content: annotation.content,
    annotation_type: annotation.annotation_type,
    position_x: annotation.position_x,
    position_y: annotation.position_y,
    position_z: annotation.position_z,
    exp_awarded: annotation.exp_awarded || 0,
    created_at: annotation.created_at,
  };
}

function worldSpaceDetailFailure() {
  return privateJson({ error: 'Failed to load space' }, { status: 500 });
}

function worldSpaceUpdateFailure() {
  return privateJson({ error: 'Failed to update space' }, { status: 500 });
}

function worldSpaceDeleteFailure() {
  return privateJson({ error: 'Failed to delete space' }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const spaceId = normalizeUuid(id);

    if (!spaceId) return privateJson({ error: 'Invalid space id' }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();

    const { data: space, error } = await supabaseAdmin
      .from('spaces')
      .select(SPACE_DETAIL_SELECT)
      .eq('id', spaceId)
      .maybeSingle();

    if (error) return worldSpaceDetailFailure();
    if (!space) return privateJson({ error: 'Space not found' }, { status: 404 });

    const { data: scans, error: scansError } = await supabaseAdmin
      .from('scan_uploads')
      .select(SCAN_DETAIL_SELECT)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });

    if (scansError) return worldSpaceDetailFailure();

    const { data: annotations, error: annotationsError } = await supabaseAdmin
      .from('spatial_annotations')
      .select(ANNOTATION_DETAIL_SELECT)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });

    if (annotationsError) return worldSpaceDetailFailure();

    return privateJson({
      space: publicSpaceDetail(space as SpaceDetailRow),
      scans: ((scans || []) as ScanDetailRow[]).map(publicScanDetail),
      annotations: ((annotations || []) as AnnotationDetailRow[]).map(publicAnnotationDetail),
    });
  } catch {
    return worldSpaceDetailFailure();
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const spaceId = normalizeUuid(id);
    const body = await safeRequestJson(req);
    const updateBody = normalizeSpaceUpdateBody(body);

    if (!spaceId) return privateJson({ error: 'Invalid space id' }, { status: 400 });
    if (!updateBody || updateBody.invalidFields) return privateJson({ error: 'Invalid space update' }, { status: 400 });
    if (Object.keys(updateBody.updates).length === 0) {
      return privateJson({ error: 'No fields to update' }, { status: 400 });
    }

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();

    const { data: spaceData, error: spaceError } = await supabaseAdmin
      .from('spaces')
      .select(HOST_SPACE_SELECT)
      .eq('id', spaceId)
      .maybeSingle();

    const space = spaceData as SpaceHostRow | null;
    if (spaceError) return worldSpaceUpdateFailure();
    if (!space) return privateJson({ error: 'Space not found' }, { status: 404 });
    if (!isSpaceHost(space.host_id, auth)) return privateJson({ error: 'Not authorized - host only' }, { status: 403 });

    const { data: updated, error } = await supabaseAdmin
      .from('spaces')
      .update(updateBody.updates)
      .eq('id', spaceId)
      .select(SPACE_DETAIL_SELECT)
      .maybeSingle();

    if (error || !updated) return worldSpaceUpdateFailure();
    return privateJson({ space: publicSpaceDetail(updated as SpaceDetailRow) });
  } catch {
    return worldSpaceUpdateFailure();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const spaceId = normalizeUuid(id);

    if (!spaceId) return privateJson({ error: 'Invalid space id' }, { status: 400 });

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();

    const { data: spaceData, error: spaceError } = await supabaseAdmin
      .from('spaces')
      .select(HOST_SPACE_SELECT)
      .eq('id', spaceId)
      .maybeSingle();

    const space = spaceData as SpaceHostRow | null;
    if (spaceError) return worldSpaceDeleteFailure();
    if (!space) return privateJson({ error: 'Space not found' }, { status: 404 });
    if (!isSpaceHost(space.host_id, auth)) return privateJson({ error: 'Not authorized - host only' }, { status: 403 });

    const { data: scans, error: scansError } = await supabaseAdmin
      .from('scan_uploads')
      .select(SCAN_ID_SELECT)
      .eq('space_id', spaceId);

    if (scansError) return worldSpaceDeleteFailure();

    const scanIds = ((scans || []) as ScanIdRow[]).map(scan => scan.id);

    if (scanIds.length > 0) {
      const { error: qualityDeleteError } = await supabaseAdmin.from('scan_quality_log').delete().in('scan_id', scanIds);
      if (qualityDeleteError) return worldSpaceDeleteFailure();
    }

    const { error: annotationsDeleteError } = await supabaseAdmin.from('spatial_annotations').delete().eq('space_id', spaceId);
    if (annotationsDeleteError) return worldSpaceDeleteFailure();

    const { error: scansDeleteError } = await supabaseAdmin.from('scan_uploads').delete().eq('space_id', spaceId);
    if (scansDeleteError) return worldSpaceDeleteFailure();

    const { error } = await supabaseAdmin.from('spaces').delete().eq('id', spaceId);
    if (error) return worldSpaceDeleteFailure();

    return privateJson({ success: true, deleted: spaceId });
  } catch {
    return worldSpaceDeleteFailure();
  }
}
