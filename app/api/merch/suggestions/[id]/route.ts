import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUGGESTION_STATUSES = ['pending', 'approved', 'rejected', 'live'] as const;

type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

function isSuggestionStatus(value: unknown): value is SuggestionStatus {
  return typeof value === 'string' && SUGGESTION_STATUSES.includes(value as SuggestionStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return privateJson({ error: 'Invalid suggestion id' }, { status: 400 });

  const access = await getMovementAccess(req);
  if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed) || !isSuggestionStatus(parsed.status)) {
    return privateJson({ error: 'Valid status required' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from('merch_suggestions')
    .update({ status: parsed.status })
    .eq('id', id)
    .select('id,status')
    .single();

  if (error || !data) return privateJson({ error: 'Failed to update merch suggestion' }, { status: 500 });

  return privateJson({ suggestion: data });
}
