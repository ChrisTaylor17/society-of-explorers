import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const VALID_REACTIONS = new Set(['illuminate', 'challenge', 'extend', 'question', 'mint_worthy']);

type TwiddleReactionBody = {
  reaction_type?: unknown;
};

type ExistingReactionRow = {
  id: string;
};

type ReactionRow = {
  reaction_type: string;
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

function normalizeReactionType(value: unknown) {
  return typeof value === 'string' && VALID_REACTIONS.has(value) ? value : '';
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return privateJson({ error: 'Invalid Twiddle' }, { status: 400 });

  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const body = parsed as TwiddleReactionBody;
  const reactionType = normalizeReactionType(body.reaction_type);
  if (!reactionType) return privateJson({ error: 'Invalid reaction_type' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  if (!auth.member.supabase_auth_id) {
    return privateJson({ error: 'Supabase auth session required to react' }, { status: 403 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: existing } = await supabaseAdmin
      .from('twiddle_reactions')
      .select('id')
      .eq('twiddle_id', id)
      .eq('user_id', auth.member.supabase_auth_id)
      .eq('reaction_type', reactionType)
      .single();

    if (existing) {
      const existingRow = existing as ExistingReactionRow;
      const { error } = await supabaseAdmin.from('twiddle_reactions').delete().eq('id', existingRow.id);
      if (error) return privateJson({ error: 'Failed to save reaction' }, { status: 500 });
      return privateJson({ toggled: 'removed' });
    }

    const { error } = await supabaseAdmin.from('twiddle_reactions').insert({
      twiddle_id: id,
      user_id: auth.member.supabase_auth_id,
      reaction_type: reactionType,
    });

    if (error) return privateJson({ error: 'Failed to save reaction' }, { status: 500 });
    return privateJson({ toggled: 'added' });
  } catch {
    return privateJson({ error: 'Failed to save reaction' }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return privateJson({ error: 'Invalid Twiddle' }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data } = await supabaseAdmin
      .from('twiddle_reactions')
      .select('reaction_type')
      .eq('twiddle_id', id);

    const counts: Record<string, number> = {};
    for (const reaction of (data || []) as ReactionRow[]) {
      counts[reaction.reaction_type] = (counts[reaction.reaction_type] || 0) + 1;
    }

    return privateJson({ counts });
  } catch {
    return privateJson({ counts: {} });
  }
}
