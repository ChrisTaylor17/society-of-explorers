import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMovementAccess } from '@/lib/movement/access';
import { generateScripts } from '@/lib/movement/scriptgen';

export const runtime = 'nodejs';
export const maxDuration = 120;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MANAGER_STATUSES = ['draft', 'approved', 'published', 'archived'] as const;

type ManagerStatus = (typeof MANAGER_STATUSES)[number];

function isManagerStatus(value: string | null): value is ManagerStatus {
  return !!value && MANAGER_STATUSES.includes(value as ManagerStatus);
}

export async function POST(req: NextRequest) {
  try {
    const access = await getMovementAccess(req);
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return NextResponse.json({ error: 'Oracle or founder access required' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as { questionId?: unknown };
    if (typeof body.questionId !== 'string' || !body.questionId) {
      return NextResponse.json({ error: 'questionId required' }, { status: 400 });
    }

    const scripts = await generateScripts(body.questionId);
    return NextResponse.json({ scripts });
  } catch (err) {
    console.error('[movement/scripts/generate] failed', err);
    return NextResponse.json({ error: 'Script generation failed', details: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const access = await getMovementAccess(req);
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return NextResponse.json({ error: 'Oracle or founder access required' }, { status: 403 });

    const statusParam = req.nextUrl.searchParams.get('status');
    const status = isManagerStatus(statusParam) ? statusParam : 'draft';

    const { data, error } = await supabaseAdmin
      .from('movement_scripts')
      .select('*, daily_questions(question_text, date, thinker_id)')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) throw error;
    return NextResponse.json({ scripts: data || [] });
  } catch (err) {
    console.error('[movement/scripts/list] failed', err);
    return NextResponse.json({ error: 'Script queue failed', details: String(err) }, { status: 500 });
  }
}
