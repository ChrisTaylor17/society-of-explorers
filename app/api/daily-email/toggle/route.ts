import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth?.memberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { subscribed } = await req.json().catch(() => ({ subscribed: null }));
  if (typeof subscribed !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('daily_email_subscriptions')
    .select('id, unsubscribed_at')
    .eq('member_id', auth.memberId)
    .maybeSingle();

  if (subscribed) {
    if (existing) {
      await supabase
        .from('daily_email_subscriptions')
        .update({ unsubscribed_at: null, subscribed_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('daily_email_subscriptions')
        .insert({ member_id: auth.memberId });
    }
  } else if (existing && !existing.unsubscribed_at) {
    await supabase
      .from('daily_email_subscriptions')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', existing.id);
  }

  return NextResponse.json({ ok: true, subscribed });
}
