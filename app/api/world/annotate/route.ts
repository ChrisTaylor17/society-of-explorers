import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_ANNOTATION_BODY_LENGTH = 8192;
const MAX_ANNOTATION_CONTENT_LENGTH = 2000;
const MAX_ANNOTATION_POSITION_ABS = 1_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ANNOTATION_TYPES = new Set(['note', 'insight', 'question', 'story', 'warning', 'ritual']);
const SPACE_EXISTS_SELECT = 'id';
const SCAN_SPACE_SELECT = 'id, space_id';
const ANNOTATION_INSERT_SELECT = 'id, annotation_type, created_at';
const ANNOTATION_EXP_AWARD = 3;

type AnnotationType = 'note' | 'insight' | 'question' | 'story' | 'warning' | 'ritual';

type ScanSpaceRow = {
  id: string;
  space_id: string | null;
};

type AnnotationReceiptRow = {
  id: string;
  annotation_type: AnnotationType;
  created_at: string;
};

type MemberExpRow = {
  exp_tokens: number | null;
};

type NormalizedAnnotationBody = {
  spaceId: string;
  scanId: string | null;
  invalidScanId: boolean;
  content: string;
  annotationType: AnnotationType | null;
  positionX: number | null;
  positionY: number | null;
  positionZ: number | null;
};

async function safeRequestJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  const rawBody = await req.text();
  if (!rawBody || rawBody.length > MAX_ANNOTATION_BODY_LENGTH) return null;

  try {
    const parsedBody = JSON.parse(rawBody);
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return null;
    return parsedBody as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasPresentValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && !value.trim()) return false;
  return true;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeOptionalUuid(value: unknown): string | null {
  if (!hasPresentValue(value)) return null;
  return normalizeUuid(value);
}

function normalizeAnnotationContent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const content = value.trim();
  if (!content) return null;
  return content.slice(0, MAX_ANNOTATION_CONTENT_LENGTH);
}

function normalizeAnnotationType(value: unknown): AnnotationType | null {
  if (!hasPresentValue(value)) return 'note';
  if (typeof value !== 'string') return null;
  const annotationType = value.trim().toLowerCase();
  return ALLOWED_ANNOTATION_TYPES.has(annotationType) ? (annotationType as AnnotationType) : null;
}

function normalizePosition(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (Math.abs(value) > MAX_ANNOTATION_POSITION_ABS) return null;
  return value;
}

function normalizeAnnotationBody(body: Record<string, unknown> | null): NormalizedAnnotationBody | null {
  const spaceId = normalizeUuid(body?.spaceId);
  const content = normalizeAnnotationContent(body?.content);

  if (!spaceId || !content) return null;

  const scanId = normalizeOptionalUuid(body?.scanId);

  return {
    spaceId,
    scanId,
    invalidScanId: hasPresentValue(body?.scanId) && !scanId,
    content,
    annotationType: normalizeAnnotationType(body?.annotationType),
    positionX: normalizePosition(body?.positionX),
    positionY: normalizePosition(body?.positionY),
    positionZ: normalizePosition(body?.positionZ),
  };
}

function publicAnnotationReceipt(annotation: AnnotationReceiptRow, newTotal: number) {
  return {
    annotation: {
      id: annotation.id,
      annotation_type: annotation.annotation_type,
      created_at: annotation.created_at,
    },
    expAwarded: ANNOTATION_EXP_AWARD,
    newTotal,
  };
}

function worldAnnotationFailure() {
  return privateJson({ error: 'Failed to create annotation' }, { status: 500 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await safeRequestJson(req);
    const annotationBody = normalizeAnnotationBody(body);

    if (!annotationBody) {
      return privateJson({ error: 'Missing required fields: spaceId, content' }, { status: 400 });
    }

    if (annotationBody.invalidScanId) {
      return privateJson({ error: 'Invalid scan' }, { status: 400 });
    }

    if (!annotationBody.annotationType) {
      return privateJson({ error: 'Invalid annotation type' }, { status: 400 });
    }

    const { spaceId, scanId, content, annotationType, positionX, positionY, positionZ } = annotationBody;

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();
    const authorId = auth.member.supabase_auth_id || auth.memberId;

    const { data: space, error: spaceError } = await supabaseAdmin
      .from('spaces')
      .select(SPACE_EXISTS_SELECT)
      .eq('id', spaceId)
      .maybeSingle();

    if (spaceError) return worldAnnotationFailure();
    if (!space) return privateJson({ error: 'Space not found' }, { status: 404 });

    if (scanId) {
      const { data: scan, error: scanError } = await supabaseAdmin
        .from('scan_uploads')
        .select(SCAN_SPACE_SELECT)
        .eq('id', scanId)
        .maybeSingle();

      if (scanError) return worldAnnotationFailure();
      const scanRow = scan as ScanSpaceRow | null;
      if (!scanRow || scanRow.space_id !== spaceId) {
        return privateJson({ error: 'Invalid scan' }, { status: 400 });
      }
    }

    const { data: annotation, error } = await supabaseAdmin
      .from('spatial_annotations')
      .insert({
        space_id: spaceId,
        scan_id: scanId,
        author_id: authorId,
        content,
        annotation_type: annotationType,
        position_x: positionX,
        position_y: positionY,
        position_z: positionZ,
        exp_awarded: ANNOTATION_EXP_AWARD,
      })
      .select(ANNOTATION_INSERT_SELECT)
      .maybeSingle();

    if (error || !annotation) return worldAnnotationFailure();

    const annotationRow = annotation as AnnotationReceiptRow;
    const { error: expEventError } = await supabaseAdmin.from('exp_events').insert({
      member_id: auth.memberId,
      amount: ANNOTATION_EXP_AWARD,
      reason: 'spatial_annotation',
      metadata: JSON.stringify({ annotationId: annotationRow.id, spaceId, type: annotationType }),
    });

    if (expEventError) return worldAnnotationFailure();

    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('exp_tokens')
      .eq('id', auth.memberId)
      .maybeSingle();

    if (memberError || !member) return worldAnnotationFailure();

    const memberRow = member as MemberExpRow;
    const newTotal = (memberRow.exp_tokens || 0) + ANNOTATION_EXP_AWARD;
    const { error: memberUpdateError } = await supabaseAdmin
      .from('members')
      .update({ exp_tokens: newTotal })
      .eq('id', auth.memberId);

    if (memberUpdateError) return worldAnnotationFailure();

    return privateJson(publicAnnotationReceipt(annotationRow, newTotal));
  } catch {
    return worldAnnotationFailure();
  }
}
