import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CONTENT_LENGTH = 2_000;

type TwiddlePatchBody = {
  is_woven?: unknown;
  woven_from?: unknown;
  minted?: unknown;
  nft_token_id?: unknown;
  content?: unknown;
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
  woven_from: string[] | null;
  minted: boolean | null;
  nft_token_id: number | null;
  created_at: string | null;
};

type ReactionRow = {
  twiddle_id: string;
  reaction_type: string;
};

type TwiddleWithReactions = TwiddleRow & {
  reaction_counts: Record<string, number>;
};

type SafeTwiddleUpdates = {
  is_woven?: boolean;
  woven_from?: string[];
  minted?: boolean;
  nft_token_id?: number | null;
  content?: string;
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

function normalizeUuidList(value: unknown) {
  if (!Array.isArray(value)) return null;
  const ids = Array.from(new Set(value.filter(isUuid)));
  return ids.length === value.length ? ids.slice(0, 25) : null;
}

function normalizeTokenId(value: unknown) {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function buildSafeUpdates(updates: TwiddlePatchBody): SafeTwiddleUpdates {
  const allowed: SafeTwiddleUpdates = {};

  if (typeof updates.is_woven === 'boolean') allowed.is_woven = updates.is_woven;

  if ('woven_from' in updates) {
    const wovenFrom = normalizeUuidList(updates.woven_from);
    if (wovenFrom) allowed.woven_from = wovenFrom;
  }

  if (typeof updates.minted === 'boolean') allowed.minted = updates.minted;

  if ('nft_token_id' in updates) {
    const tokenId = normalizeTokenId(updates.nft_token_id);
    if (tokenId !== undefined) allowed.nft_token_id = tokenId;
  }

  if ('content' in updates) {
    const content = boundedText(updates.content);
    if (content) allowed.content = content;
  }

  return allowed;
}

function buildReactionMap(reactions: ReactionRow[]) {
  const reactionMap: Record<string, Record<string, number>> = {};

  for (const reaction of reactions) {
    if (!reactionMap[reaction.twiddle_id]) reactionMap[reaction.twiddle_id] = {};
    reactionMap[reaction.twiddle_id][reaction.reaction_type] =
      (reactionMap[reaction.twiddle_id][reaction.reaction_type] || 0) + 1;
  }

  return reactionMap;
}

function withReactionCounts(twiddle: TwiddleRow, reactionMap: Record<string, Record<string, number>>) {
  return { ...twiddle, reaction_counts: reactionMap[twiddle.id] || {} } satisfies TwiddleWithReactions;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return privateJson({ error: 'Invalid Twiddle' }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: twiddle } = await supabaseAdmin.from('twiddles').select('*').eq('id', id).single();
    if (!twiddle) return privateJson({ error: 'Not found' }, { status: 404 });

    const twiddleRow = twiddle as TwiddleRow;
    const rootId = twiddleRow.root_id && UUID_PATTERN.test(twiddleRow.root_id) ? twiddleRow.root_id : id;
    const { data: threadRows } = await supabaseAdmin
      .from('twiddles')
      .select('*')
      .or(`root_id.eq.${rootId},id.eq.${rootId}`)
      .order('created_at', { ascending: true });

    const thread = (threadRows || []) as TwiddleRow[];
    const threadIds = thread.map((threadTwiddle) => threadTwiddle.id).filter((threadId) => UUID_PATTERN.test(threadId));

    let reactions: ReactionRow[] = [];
    if (threadIds.length > 0) {
      const { data: reactionRows } = await supabaseAdmin
        .from('twiddle_reactions')
        .select('twiddle_id, reaction_type')
        .in('twiddle_id', threadIds);
      reactions = (reactionRows || []) as ReactionRow[];
    }

    const reactionMap = buildReactionMap(reactions);
    const enriched = thread.map((threadTwiddle) => withReactionCounts(threadTwiddle, reactionMap));

    return privateJson({
      twiddle: withReactionCounts(twiddleRow, reactionMap),
      thread: enriched,
    });
  } catch {
    return privateJson({ error: 'Failed to load Twiddle' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return privateJson({ error: 'Invalid Twiddle' }, { status: 400 });

  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const body = parsed as TwiddlePatchBody;
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  if (!auth.member.supabase_auth_id) {
    return privateJson({ error: 'Supabase auth session required to update Twiddles' }, { status: 403 });
  }

  const allowed = buildSafeUpdates(body);
  if (Object.keys(allowed).length === 0) {
    return privateJson({ error: 'No valid updates' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: twiddle } = await supabaseAdmin.from('twiddles').select('author_id').eq('id', id).single();
    if (!twiddle) return privateJson({ error: 'Not authorized' }, { status: 403 });

    const twiddleOwner = twiddle as Pick<TwiddleRow, 'author_id'>;
    if (twiddleOwner.author_id !== auth.member.supabase_auth_id) {
      return privateJson({ error: 'Not authorized' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('twiddles')
      .update(allowed)
      .eq('id', id)
      .select()
      .single();
    if (error || !data) return privateJson({ error: 'Failed to update Twiddle' }, { status: 500 });

    return privateJson({ twiddle: data });
  } catch {
    return privateJson({ error: 'Failed to update Twiddle' }, { status: 500 });
  }
}
