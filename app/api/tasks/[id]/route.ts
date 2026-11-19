import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type TaskUpdate = {
  updated_at: string;
  status?: string;
  title?: string;
  description?: string | null;
  priority?: string;
  completed_at?: string;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: task } = await supabaseAdmin
    .from('agent_tasks')
    .select('*')
    .eq('id', id)
    .eq('member_id', auth.memberId)
    .single();

  if (!task) return privateJson({ error: 'Not found' }, { status: 404 });
  return privateJson({ task });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as {
    status?: string;
    title?: string;
    description?: string | null;
    priority?: string;
  };
  const updates: TaskUpdate = { updated_at: new Date().toISOString() };

  if (body.status) updates.status = body.status;
  if (body.title) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.priority) updates.priority = body.priority;
  if (body.status === 'completed') updates.completed_at = new Date().toISOString();

  const supabaseAdmin = getSupabaseAdmin();
  const { data: task, error } = await supabaseAdmin
    .from('agent_tasks')
    .update(updates)
    .eq('id', id)
    .eq('member_id', auth.memberId)
    .select()
    .single();

  if (error) return privateJson({ error: 'Update failed' }, { status: 500 });
  return privateJson({ task });
}
