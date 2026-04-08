import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: tasks, error } = await supabaseAdmin
    .from('agent_tasks')
    .select('*')
    .eq('member_id', auth.memberId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Tasks fetch error:', error);
    return NextResponse.json({ tasks: [] });
  }

  return NextResponse.json({ tasks: tasks || [] });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);

  // Also accept memberId from body for council mode
  let memberId = auth?.memberId || null;
  const body = await req.json();

  if (!memberId && body.memberId) {
    memberId = body.memberId;
  }

  const { title, description, priority, source_thinker } = body;

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const { data: task, error } = await supabaseAdmin
    .from('agent_tasks')
    .insert({
      member_id: memberId,
      title: title.trim(),
      description: description?.trim() || null,
      priority: priority || 'medium',
      source_thinker: source_thinker || null,
      status: 'created',
    })
    .select()
    .single();

  if (error) {
    console.error('Task create error:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }

  return NextResponse.json({ success: true, task });
}
