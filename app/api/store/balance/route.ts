import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ balance: 0 });

  const { data, error } = await supabase
    .from('exp_events')
    .select('amount')
    .eq('member_id', memberId);

  if (error) {
    return NextResponse.json({ balance: 0, error: error.message });
  }

  const balance = (data || []).reduce((sum, row: any) => sum + (Number(row.amount) || 0), 0);
  return NextResponse.json({ balance });
}
