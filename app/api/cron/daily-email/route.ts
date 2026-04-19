import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getOrCreateTodayQuestion } from '@/lib/practice/todayQuestion';
import { renderDailyPracticeEmail } from '@/lib/email/dailyPractice';
import { THINKER_PROFILES } from '@/lib/claude/thinkers';

export const runtime = 'nodejs';
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const resend = new Resend(process.env.RESEND_API_KEY!);

async function handler(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const question = await getOrCreateTodayQuestion();
  if (!question) {
    return NextResponse.json({ error: 'No question' }, { status: 500 });
  }

  const thinker = THINKER_PROFILES[question.thinker_id];
  const thinkerName = thinker?.name || question.thinker_id;

  const { data: subs, error: subsError } = await supabase
    .from('daily_email_subscriptions')
    .select('id, unsubscribe_token, member_id, last_sent_question_id, members!inner(email, display_name)')
    .is('unsubscribed_at', null)
    .or(`last_sent_question_id.is.null,last_sent_question_id.neq.${question.id}`)
    .not('members.email', 'is', null);

  console.log('[cron/daily-email] question', question.id, 'subs', subs?.length ?? 0, 'err', subsError?.message);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ sent: 0, reason: subsError?.message ?? 'no-matching-subs' });
  }

  let sent = 0;
  let errors = 0;
  for (const sub of subs as any[]) {
    const email = sub.members?.email;
    const displayName = sub.members?.display_name || 'Explorer';
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
    } catch (e) {
      console.error('[cron/daily-email] send failed:', e);
      errors++;
    }
    if (sent % 10 === 0) await new Promise(r => setTimeout(r, 200));
  }

  return NextResponse.json({ sent, errors, total: subs.length });
}

export const GET = handler;
