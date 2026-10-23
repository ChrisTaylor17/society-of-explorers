import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type ToggleBody = {
  subscribed?: unknown;
};

type DailyEmailSubscription = {
  id: string;
  unsubscribed_at: string | null;
};

function databaseFailure() {
  return privateJson({ error: 'Failed to update daily email preference' }, { status: 500 });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth?.memberId) {
      return privateJson({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscribed } = (await req.json().catch((): ToggleBody => ({ subscribed: null }))) as ToggleBody;
    if (typeof subscribed !== 'boolean') {
      return privateJson({ error: 'Invalid body' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: lookupError } = await supabase
      .from('daily_email_subscriptions')
      .select('id, unsubscribed_at')
      .eq('member_id', auth.memberId)
      .maybeSingle();

    if (lookupError) return databaseFailure();

    const existingSubscription = existing as DailyEmailSubscription | null;

    if (subscribed) {
      if (existingSubscription) {
        const { error } = await supabase
          .from('daily_email_subscriptions')
          .update({ unsubscribed_at: null, subscribed_at: new Date().toISOString() })
          .eq('id', existingSubscription.id);

        if (error) return databaseFailure();
      } else {
        const { error } = await supabase
          .from('daily_email_subscriptions')
          .insert({ member_id: auth.memberId });

        if (error) return databaseFailure();
      }
    } else if (existingSubscription && !existingSubscription.unsubscribed_at) {
      const { error } = await supabase
        .from('daily_email_subscriptions')
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq('id', existingSubscription.id);

      if (error) return databaseFailure();
    }

    return privateJson({ ok: true, subscribed });
  } catch {
    return privateJson({ error: 'Failed to update daily email preference' }, { status: 500 });
  }
}
