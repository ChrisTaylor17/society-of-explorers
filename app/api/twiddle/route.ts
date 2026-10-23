import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const VALID_THINKERS = new Set(['socrates', 'plato', 'nietzsche', 'aurelius', 'einstein', 'jobs']);
const TWIDDLE_TYPES = new Set(['text', 'voice', 'artifact', 'question', 'sketch']);
const THREAD_TYPES = new Set(['solo', 'open', 'collaborative']);
const FEED_FILTERS = new Set(['trending', 'thinker_picks', 'my', 'archive']);
const MAX_CONTENT_LENGTH = 2_000;
const MAX_URL_LENGTH = 2_048;
const MAX_THINKER_TAGS = 6;
const MAX_SKETCH_JSON_LENGTH = 8_000;

type TwiddleCreateBody = {
  content?: unknown;
  twiddle_type?: unknown;
  thread_type?: unknown;
  thinker_tags?: unknown;
  voice_url?: unknown;
  artifact_url?: unknown;
  sketch_data?: unknown;
  parent_id?: unknown;
};

type ParentTwiddleRow = {
  root_id: string | null;
};

type TwiddleRow = {
  id: string;
  author_id: string | null;
  content: string | null;
  twiddle_type: string | null;
  thread_type: string | null;
  thinker_tags: string[] | null;
  voice_url: string | null;
  artifact_url: string | null;
  sketch_data: unknown;
  parent_id: string | null;
  root_id: string | null;
  is_thinker_response: boolean | null;
  thinker_key: string | null;
  is_woven: boolean | null;
  minted: boolean | null;
  created_at: string | null;
};

type TwiddleWithReactions = TwiddleRow & {
  reaction_counts: Record<string, number>;
};

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function boundedText(value: unknown, maxLength = MAX_CONTENT_LENGTH) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeTwiddleType(value: unknown) {
  return typeof value === 'string' && TWIDDLE_TYPES.has(value) ? value : 'text';
}

function normalizeThreadType(value: unknown) {
  return typeof value === 'string' && THREAD_TYPES.has(value) ? value : 'open';
}

function normalizeFeedFilter(value: unknown) {
  return typeof value === 'string' && FEED_FILTERS.has(value) ? value : 'trending';
}

function normalizeThinker(value: unknown) {
  return typeof value === 'string' && VALID_THINKERS.has(value) ? value : '';
}

function normalizeThinkerTags(value: unknown) {
  if (!Array.isArray(value)) return [];

  const tags = new Set<string>();
  for (const tag of value) {
    if (typeof tag === 'string' && VALID_THINKERS.has(tag)) tags.add(tag);
    if (tags.size >= MAX_THINKER_TAGS) break;
  }

  return Array.from(tags);
}

function normalizeOptionalUrl(value: unknown) {
  const url = boundedText(value, MAX_URL_LENGTH);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function normalizeSketchData(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return null;

  try {
    return JSON.stringify(value).length <= MAX_SKETCH_JSON_LENGTH ? value : null;
  } catch {
    return null;
  }
}

function normalizeLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.floor(parsed), 1), 50);
}

function normalizeOffset(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.floor(parsed), 0);
}

function withEmptyReactionCounts(twiddle: TwiddleRow): TwiddleWithReactions {
  return { ...twiddle, reaction_counts: {} };
}

export async function POST(req: NextRequest) {
  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const body = parsed as TwiddleCreateBody;
  const twiddleType = normalizeTwiddleType(body.twiddle_type);
  const content = boundedText(body.content);
  const parentId = isUuid(body.parent_id) ? body.parent_id : null;

  if (!content && twiddleType !== 'voice') {
    return privateJson({ error: 'Content required' }, { status: 400 });
  }

  if (body.parent_id && !parentId) {
    return privateJson({ error: 'Invalid parent Twiddle' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  if (!auth.member.supabase_auth_id) {
    return privateJson({ error: 'Supabase auth session required to create Twiddles' }, { status: 403 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  let rootId: string | null = null;
  if (parentId) {
    const { data: parent } = await supabaseAdmin
      .from('twiddles')
      .select('root_id')
      .eq('id', parentId)
      .single();
    if (!parent) return privateJson({ error: 'Parent Twiddle not found' }, { status: 404 });

    const parentRow = parent as ParentTwiddleRow;
    rootId = parentRow.root_id && UUID_PATTERN.test(parentRow.root_id) ? parentRow.root_id : parentId;
  }

  try {
    const { data: twiddle, error } = await supabaseAdmin
      .from('twiddles')
      .insert({
        author_id: auth.member.supabase_auth_id,
        content,
        twiddle_type: twiddleType,
        thread_type: normalizeThreadType(body.thread_type),
        thinker_tags: normalizeThinkerTags(body.thinker_tags),
        voice_url: normalizeOptionalUrl(body.voice_url),
        artifact_url: normalizeOptionalUrl(body.artifact_url),
        sketch_data: normalizeSketchData(body.sketch_data),
        parent_id: parentId,
        root_id: rootId,
      })
      .select()
      .single();

    if (error || !twiddle) return privateJson({ error: 'Failed to create Twiddle' }, { status: 500 });
    return privateJson({ twiddle });
  } catch {
    return privateJson({ error: 'Failed to create Twiddle' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const filter = normalizeFeedFilter(searchParams.get('filter'));
  const thinker = normalizeThinker(searchParams.get('thinker'));
  const limit = normalizeLimit(searchParams.get('limit'));
  const offset = normalizeOffset(searchParams.get('offset'));

  let authUserId = '';
  if (filter === 'my') {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    if (!auth.member.supabase_auth_id) return privateJson({ twiddles: [] });
    authUserId = auth.member.supabase_auth_id;
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    let query = supabaseAdmin
      .from('twiddles')
      .select('*')
      .is('parent_id', null)
      .range(offset, offset + limit - 1);

    if (thinker) {
      query = query.contains('thinker_tags', [thinker]);
    }

    switch (filter) {
      case 'my':
        query = query.eq('author_id', authUserId).order('created_at', { ascending: false });
        break;
      case 'archive':
        query = query.eq('is_woven', true).order('created_at', { ascending: false });
        break;
      case 'thinker_picks':
        query = query.eq('is_thinker_response', false).order('created_at', { ascending: false });
        break;
      case 'trending':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    const { data, error } = await query;
    if (error) return privateJson({ twiddles: [] });

    const twiddles = ((data || []) as TwiddleRow[]).map(withEmptyReactionCounts);
    return privateJson({ twiddles });
  } catch {
    return privateJson({ twiddles: [] });
  }
}
