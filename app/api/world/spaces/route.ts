import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_SPACE_BODY_LENGTH = 8192;
const MAX_SPACE_NAME_LENGTH = 120;
const MAX_SPACE_SLUG_LENGTH = 80;
const MAX_SPACE_DESCRIPTION_LENGTH = 1000;
const MAX_SPACE_LOCATION_LENGTH = 160;
const MAX_SPACE_URL_LENGTH = 2048;
const SPACE_EXP_AWARD = 15;
const SPACE_LIST_SELECT = 'id, name, slug, description, city, country, space_type, total_scans, avg_quality, cover_url, created_at';
const SPACE_SLUG_SELECT = 'id';
const SPACE_INSERT_SELECT = SPACE_LIST_SELECT;
const MEMBER_EXP_SELECT = 'exp_tokens';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_SPACE_TYPES = new Set(['salon', 'library', 'temple', 'garden', 'waypoint', 'outpost']);
const ALLOWED_SPACE_STATUSES = new Set(['active', 'archived', 'pending']);

type SpaceType = 'salon' | 'library' | 'temple' | 'garden' | 'waypoint' | 'outpost';
type SpaceStatus = 'active' | 'archived' | 'pending';

type SpaceSummaryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  country: string | null;
  space_type: SpaceType;
  total_scans: number | null;
  avg_quality: number | null;
  cover_url: string | null;
  created_at: string | null;
};

type NormalizedCreateSpaceBody = {
  name: string;
  slug: string | null;
  invalidSlug: boolean;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  spaceType: SpaceType | null;
  coverUrl: string | null;
};

type MemberExpRow = {
  exp_tokens: number | null;
};

async function safeRequestJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  const rawBody = await req.text();
  if (!rawBody || rawBody.length > MAX_SPACE_BODY_LENGTH) return null;

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

function normalizeRequiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (!hasPresentValue(value)) return null;
  return normalizeRequiredText(value, maxLength);
}

function normalizeSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const slug = value.trim().toLowerCase().slice(0, MAX_SPACE_SLUG_LENGTH);
  return SLUG_PATTERN.test(slug) ? slug : null;
}

function normalizeSpaceType(value: unknown): SpaceType | null {
  if (!hasPresentValue(value)) return 'waypoint';
  if (typeof value !== 'string') return null;
  const spaceType = value.trim().toLowerCase();
  return ALLOWED_SPACE_TYPES.has(spaceType) ? (spaceType as SpaceType) : null;
}

function normalizeSpaceStatus(value: string | null): SpaceStatus | null {
  if (!value) return 'active';
  const status = value.trim().toLowerCase();
  return ALLOWED_SPACE_STATUSES.has(status) ? (status as SpaceStatus) : null;
}

function normalizeCoordinate(value: unknown, min: number, max: number): number | null {
  if (!hasPresentValue(value)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value >= min && value <= max ? value : null;
}

function normalizeOptionalUrl(value: unknown): string | null {
  const rawUrl = normalizeOptionalText(value, MAX_SPACE_URL_LENGTH);
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString().slice(0, MAX_SPACE_URL_LENGTH);
  } catch {
    return null;
  }
}

function normalizeCreateSpaceBody(body: Record<string, unknown> | null): NormalizedCreateSpaceBody | null {
  const name = normalizeRequiredText(body?.name, MAX_SPACE_NAME_LENGTH);

  if (!name || !hasPresentValue(body?.slug)) return null;

  const slug = normalizeSlug(body?.slug);

  return {
    name,
    slug,
    invalidSlug: !slug,
    description: normalizeOptionalText(body?.description, MAX_SPACE_DESCRIPTION_LENGTH),
    address: normalizeOptionalText(body?.address, MAX_SPACE_LOCATION_LENGTH),
    city: normalizeOptionalText(body?.city, MAX_SPACE_LOCATION_LENGTH),
    country: normalizeOptionalText(body?.country, MAX_SPACE_LOCATION_LENGTH),
    lat: normalizeCoordinate(body?.lat, -90, 90),
    lng: normalizeCoordinate(body?.lng, -180, 180),
    spaceType: normalizeSpaceType(body?.spaceType),
    coverUrl: normalizeOptionalUrl(body?.coverUrl),
  };
}

function publicSpaceSummary(space: SpaceSummaryRow) {
  return {
    id: space.id,
    name: space.name,
    slug: space.slug,
    description: space.description,
    city: space.city,
    country: space.country,
    space_type: space.space_type,
    total_scans: space.total_scans || 0,
    avg_quality: space.avg_quality || 0,
    cover_url: space.cover_url,
    created_at: space.created_at,
  };
}

function publicSpaceCreateReceipt(space: SpaceSummaryRow, newTotal: number) {
  return {
    space: publicSpaceSummary(space),
    expAwarded: SPACE_EXP_AWARD,
    newTotal,
  };
}

function worldSpacesLoadFailure() {
  return privateJson({ error: 'Failed to load spaces' }, { status: 500 });
}

function worldSpacesCreateFailure() {
  return privateJson({ error: 'Failed to create space' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const city = normalizeOptionalText(searchParams.get('city'), MAX_SPACE_LOCATION_LENGTH);
    const status = normalizeSpaceStatus(searchParams.get('status'));

    if (!status) return privateJson({ error: 'Invalid status' }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .from('spaces')
      .select(SPACE_LIST_SELECT)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (city) query = query.ilike('city', `%${city}%`);

    const { data: spaces, error } = await query;
    if (error) return worldSpacesLoadFailure();

    return privateJson({ spaces: ((spaces || []) as SpaceSummaryRow[]).map(publicSpaceSummary) });
  } catch {
    return worldSpacesLoadFailure();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await safeRequestJson(req);
    const spaceBody = normalizeCreateSpaceBody(body);

    if (!spaceBody) {
      return privateJson({ error: 'Missing required fields: name, slug' }, { status: 400 });
    }

    if (spaceBody.invalidSlug || !spaceBody.slug) {
      return privateJson({ error: 'Invalid slug' }, { status: 400 });
    }

    if (!spaceBody.spaceType) {
      return privateJson({ error: 'Invalid space type' }, { status: 400 });
    }

    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();
    const hostId = auth.member.supabase_auth_id || auth.memberId;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('spaces')
      .select(SPACE_SLUG_SELECT)
      .eq('slug', spaceBody.slug)
      .maybeSingle();

    if (existingError) return worldSpacesCreateFailure();
    if (existing) return privateJson({ error: 'Slug already in use' }, { status: 409 });

    const { data: space, error } = await supabaseAdmin
      .from('spaces')
      .insert({
        name: spaceBody.name,
        slug: spaceBody.slug,
        description: spaceBody.description,
        address: spaceBody.address,
        city: spaceBody.city,
        country: spaceBody.country,
        lat: spaceBody.lat,
        lng: spaceBody.lng,
        cover_url: spaceBody.coverUrl,
        space_type: spaceBody.spaceType,
        host_id: hostId,
        status: 'active',
      })
      .select(SPACE_INSERT_SELECT)
      .maybeSingle();

    if (error || !space) return worldSpacesCreateFailure();

    const spaceRow = space as SpaceSummaryRow;
    const { error: expEventError } = await supabaseAdmin.from('exp_events').insert({
      member_id: auth.memberId,
      amount: SPACE_EXP_AWARD,
      reason: 'space_created',
      metadata: JSON.stringify({ spaceId: spaceRow.id, spaceName: spaceBody.name }),
    });

    if (expEventError) return worldSpacesCreateFailure();

    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select(MEMBER_EXP_SELECT)
      .eq('id', auth.memberId)
      .maybeSingle();

    if (memberError || !member) return worldSpacesCreateFailure();

    const memberRow = member as MemberExpRow;
    const newTotal = (memberRow.exp_tokens || 0) + SPACE_EXP_AWARD;
    const { error: memberUpdateError } = await supabaseAdmin
      .from('members')
      .update({ exp_tokens: newTotal })
      .eq('id', auth.memberId);

    if (memberUpdateError) return worldSpacesCreateFailure();

    return privateJson(publicSpaceCreateReceipt(spaceRow, newTotal));
  } catch {
    return worldSpacesCreateFailure();
  }
}
