import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMovementAccess } from '@/lib/movement/access';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALLOWED_STATUSES = ['draft', 'approved', 'published', 'archived'] as const;

type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

function isAllowedStatus(value: unknown): value is AllowedStatus {
  return typeof value === 'string' && ALLOWED_STATUSES.includes(value as AllowedStatus);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ scriptId: string }> },
) {
  try {
    const access = await getMovementAccess(req);
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!access.canManage) return NextResponse.json({ error: 'Oracle or founder access required' }, { status: 403 });

    const { scriptId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { status?: unknown };
    if (!isAllowedStatus(body.status)) {
      return NextResponse.json({ error: 'Valid status required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('movement_scripts')
      .update({ status: body.status })
      .eq('id', scriptId)
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ script: data });
  } catch (err) {
    console.error('[movement/scripts/status] failed', err);
    return NextResponse.json({ error: 'Script status update failed', details: String(err) }, { status: 500 });
  }
}
