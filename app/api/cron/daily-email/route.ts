import { NextRequest } from 'next/server';
import { getOrCreateTodayQuestion } from '@/lib/practice/todayQuestion';
import { renderDailyPracticeEmail } from '@/lib/email/dailyPractice';
import { getResend } from '@/lib/email/resend';
import { privateJson } from '@/lib/http/routeError';
import { THINKER_PROFILES } from '@/lib/claude/thinkers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface DailyEmailSubscriptionRow {
  id: string;
  unsubscribe_token: string;
  member_id: string;
  last_sent_question_id: string | null;
  members:
    | {
        email: string | null;
        display_name: string | null;
      }
    | Array<{
        email: string | null;
        display_name: string | null;
      }>
    | null;
}

function subscriptionMember(sub: DailyEmailSubscriptionRow) {
  return Array.isArray(sub.members) ? sub.members[0] : sub.members;
}

function dailyPracticeEmailNotificationsEnabled() {
  return process.env.DAILY_PRACTICE_EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

async function handler(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!dailyPracticeEmailNotificationsEnabled()) {
    return privateJson({ sent: 0, reason: 'email_disabled' });
  }

  const supabase = getSupabaseAdmin();

  const question = await getOrCreateTodayQuestion();
  if (!question) {
    return privateJson({ error: 'No question' }, { status: 500 });
  }

  const thinker = THINKER_PROFILES[question.thinker_id];
  const thinkerName = thinker?.name || question.thinker_id;

  const { data: subs, error: subsError } = await supabase
    .from('daily_email_subscriptions')
    .select('id, unsubscribe_token, member_id, last_sent_question_id, members!inner(email, display_name)')
    .is('unsubscribed_at', null)
    .or(`last_sent_question_id.is.null,last_sent_question_id.neq.${question.id}`)
    .not('members.email', 'is', null);

  if (!subs || subs.length === 0) {
    return privateJson({ sent: 0, reason: subsError ? 'subscription_lookup_failed' : 'no-matching-subs' });
  }

  const resend = getResend();
  let sent = 0;
  let errors = 0;
  for (const sub of subs as DailyEmailSubscriptionRow[]) {
    const member = subscriptionMember(sub);
    const email = member?.email;
    const displayName = member?.display_name || 'Explorer';
    if (!email) continue;
    try {
      const { subject, html } = renderDailyPracticeEmail({
        thinkerName,
        questionText: question.question_text,
        unsubscribeToken: sub.unsubscribe_token,
        displayName,
      });
      await resend.emails.send({
        from: 'Society of Explorers <notifications@societyofexplorers.com>',
        to: email,
        subject,
        html,
      });
      await supabase
        .from('daily_email_subscriptions')
        .update({ last_sent_at: new Date().toISOString(), last_sent_question_id: question.id })
        .eq('id', sub.id);
      sent++;
    } catch {
      console.warn('[cron/daily-email] send failed');
      errors++;
    }
    if (sent % 10 === 0) await new Promise(r => setTimeout(r, 200));
  }

  return privateJson({ sent, errors, total: subs.length });
}

export const GET = handler;
