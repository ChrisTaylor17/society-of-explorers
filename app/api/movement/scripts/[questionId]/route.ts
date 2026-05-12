import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMovementAccess } from '@/lib/movement/access';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const { questionId } = await context.params;
    const access = await getMovementAccess(req);
    const canManage = Boolean(access?.canManage);

    let query = supabaseAdmin
      .from('movement_scripts')
      .select('*, utm_links(short_code, clicks, utm_source, utm_medium, utm_campaign, utm_content)')
      .eq('question_id', questionId)
      .order('created_at', { ascending: false });

    if (!canManage) query = query.in('status', ['approved', 'published']);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ scripts: data || [] });
  } catch (err) {
    console.error('[movement/scripts/by-question] failed', err);
    return NextResponse.json({ error: 'Script lookup failed', details: String(err) }, { status: 500 });
  }
}
