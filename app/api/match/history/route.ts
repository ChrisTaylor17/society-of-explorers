import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ matches: [] });

  const { data } = await supabase.from('matched_conversations')
    .select('*')
    .or(`member_a.eq.${auth.memberId},member_b.eq.${auth.memberId}`)
    .order('created_at', { ascending: false })
    .limit(20);

  const enriched = await Promise.all((data || []).map(async m => {
    const partnerId = m.member_a === auth.memberId ? m.member_b : m.member_a;
    const { data: partner } = await supabase.from('members').select('display_name').eq('id', partnerId).single();
    return { ...m, partner_name: partner?.display_name || 'Explorer' };
  }));

  return NextResponse.json({ matches: enriched });
}
