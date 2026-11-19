import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = new Set(['todo', 'doing', 'done']);

type TaskUpdateBody = {
  status?: unknown;
};

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return privateJson({ error: 'Invalid task id' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const body: TaskUpdateBody = parsed;
  if (typeof body.status !== 'string' || !ALLOWED_STATUSES.has(body.status)) {
    return privateJson({ error: 'Invalid status' }, { status: 400 });
  }

  const completedAt = body.status === 'done' ? new Date().toISOString() : null;
  const supabaseAdmin = getSupabaseAdmin();
  const { data: task, error } = await supabaseAdmin
    .from('hub_tasks')
    .update({ status: body.status, completed_at: completedAt })
    .eq('id', id)
    .eq('member_id', auth.memberId)
    .select('id, title, status, agent_id, created_at')
    .single();

  if (error) return privateJson({ error: 'Failed to update task' }, { status: 500 });

  return privateJson({ task });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return privateJson({ error: 'Invalid task id' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from('hub_tasks')
    .delete()
    .eq('id', id)
    .eq('member_id', auth.memberId);

  if (error) return privateJson({ error: 'Failed to delete task' }, { status: 500 });

  return privateJson({ success: true });
}
