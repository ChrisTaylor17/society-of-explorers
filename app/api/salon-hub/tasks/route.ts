import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_TITLE_LENGTH = 180;
const MAX_AGENT_ID_LENGTH = 80;
const DEFAULT_AGENT_ID = 'socrates';
const ALLOWED_STATUSES = new Set(['todo', 'doing', 'done']);

type TaskCreateBody = {
  title?: unknown;
  agentId?: unknown;
  agent_id?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeAgentId(value: unknown): string {
  return normalizeText(value, MAX_AGENT_ID_LENGTH) ?? DEFAULT_AGENT_ID;
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
    .from('hub_tasks')
    .select('id, title, status, agent_id, created_at')
    .eq('member_id', auth.memberId)
    .order('created_at', { ascending: true });

  if (error) return privateJson({ error: 'Failed to fetch tasks', tasks: [] }, { status: 500 });

  return privateJson({
    tasks: (tasks ?? []).filter((task) => ALLOWED_STATUSES.has(String(task.status))),
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await safeRequestJson(req);
  if (!isRecord(parsed)) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const body: TaskCreateBody = parsed;
  const title = normalizeText(body.title, MAX_TITLE_LENGTH);
  if (!title) return privateJson({ error: 'Title required' }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: task, error } = await supabaseAdmin
    .from('hub_tasks')
    .insert({
      member_id: auth.memberId,
      title,
      status: 'todo',
      agent_id: normalizeAgentId(body.agentId ?? body.agent_id),
    })
    .select('id, title, status, agent_id, created_at')
    .single();

  if (error) return privateJson({ error: 'Failed to create task' }, { status: 500 });

  return privateJson({ success: true, task });
}
