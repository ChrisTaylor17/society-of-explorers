import { NextRequest, NextResponse } from 'next/server';
import { getMovementAccess } from '@/lib/movement/access';
import { generateScripts } from '@/lib/movement/scriptgen';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
