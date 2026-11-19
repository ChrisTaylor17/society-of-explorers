import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type TaskCreateBody = {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  source_thinker?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

async function safeRequestJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: tasks, error } = await supabaseAdmin
    .from('agent_tasks')
    .select('*')
    .eq('member_id', auth.memberId)
    .order('created_at', { ascending: false });

  if (error) {
    return privateJson({ error: 'Failed to fetch tasks', tasks: [] }, { status: 500 });
  }

  return privateJson({ tasks: tasks || [] });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const body: TaskCreateBody = parsed;
  const title = textField(body.title, 180);
  const description = textField(body.description, 2000);
  const priority = textField(body.priority, 40) || 'medium';
  const sourceThinker = textField(body.source_thinker, 80);

  if (!title) return privateJson({ error: 'Title required' }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: task, error } = await supabaseAdmin
    .from('agent_tasks')
    .insert({
      member_id: auth.memberId,
      title,
      description,
      priority,
      source_thinker: sourceThinker,
      status: 'created',
    })
    .select()
    .single();

  if (error) {
    return privateJson({ error: 'Failed to create task' }, { status: 500 });
  }

  return privateJson({ success: true, task });
}
