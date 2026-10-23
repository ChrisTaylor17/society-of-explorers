import { NextRequest } from 'next/server';
import { getResend } from '@/lib/email/resend';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const THINKER_NAMES: Record<string, string> = {
  socrates: 'Socrates', plato: 'Plato', aurelius: 'Marcus Aurelius',
  nietzsche: 'Nietzsche', einstein: 'Einstein', jobs: 'Steve Jobs',
};

function practiceFollowupEmailNotificationsEnabled() {
  return process.env.DAILY_PRACTICE_FOLLOWUP_EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function handler(req: NextRequest) {
  // Verify cron secret (Vercel sends this automatically when CRON_SECRET is set)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!practiceFollowupEmailNotificationsEnabled()) {
    return privateJson({ sent: 0, reason: 'email_disabled' });
  }

  const supabase = getSupabaseAdmin();

  const today = getTodayET();

  // Get tomorrow's question (or today's if we're sending in the evening)
  const { data: question } = await supabase.from('daily_questions')
    .select('*')
    .eq('date', today)
    .single();

  if (!question) {
    return privateJson({ error: 'No question found for today', sent: 0 });
  }

  const thinkerName = THINKER_NAMES[question.thinker_id] || question.thinker_id;
  const safeThinkerName = escapeHtml(thinkerName);
  const safeQuestionText = escapeHtml(String(question.question_text ?? ''));

  // Get members who answered today (they're engaged — send them tomorrow's teaser)
  const { data: todayResponders } = await supabase
    .from('question_responses')
    .select('member_id')
    .eq('question_id', question.id);

  if (!todayResponders || todayResponders.length === 0) {
    return privateJson({ sent: 0, reason: 'No responders today' });
  }

  const responderIds = todayResponders.map(r => r.member_id);

  // Get member emails (only those with email and not unsubscribed)
  const { data: members } = await supabase
    .from('members')
    .select('id, display_name, email, current_streak')
    .in('id', responderIds)
    .not('email', 'is', null);

  if (!members || members.length === 0) {
    return privateJson({ sent: 0, reason: 'No members with emails' });
  }

  const resend = getResend();
  let sent = 0;
  let errors = 0;

  for (const member of members) {
    if (!member.email) continue;

    const streakLine = member.current_streak > 1
      ? `You\u2019re on a ${member.current_streak}-day streak. Don\u2019t break it.`
      : 'Start building your streak.';

    try {
      await resend.emails.send({
        from: 'Society of Explorers <notifications@societyofexplorers.com>',
        to: member.email,
        subject: `${thinkerName} asked today \u2014 will you answer tomorrow?`,
        html: `
          <div style="max-width:480px;margin:0 auto;font-family:Georgia,serif;color:#f5f0e8;background:#0a0a0a;padding:2rem;">
            <div style="text-align:center;margin-bottom:2rem;">
              <span style="font-family:serif;font-size:10px;letter-spacing:0.3em;color:#c9a84c;">DAILY PRACTICE</span>
            </div>

            <p style="font-size:15px;color:#9a8f7a;margin-bottom:0.5rem;">Today, ${safeThinkerName} asked:</p>
            <p style="font-size:20px;font-style:italic;color:#f5f0e8;line-height:1.6;margin-bottom:1.5rem;">
              \u201c${safeQuestionText}\u201d
            </p>

            <div style="border-top:1px solid rgba(201,168,76,0.15);padding-top:1rem;margin-bottom:1.5rem;">
              <p style="font-size:14px;color:#9a8f7a;margin-bottom:0.25rem;">${streakLine}</p>
              <p style="font-size:13px;color:rgba(154,143,122,0.6);">Tomorrow\u2019s question arrives at 8am ET.</p>
            </div>

            <div style="text-align:center;margin-bottom:2rem;">
              <a href="https://societyofexplorers.com/practice" style="display:inline-block;padding:12px 28px;background:#c9a84c;color:#0a0a0a;text-decoration:none;font-family:serif;font-size:12px;letter-spacing:0.15em;">
                TOMORROW\u2019S QUESTION
              </a>
            </div>

            <div style="text-align:center;border-top:1px solid rgba(201,168,76,0.08);padding-top:1rem;">
              <span style="font-size:10px;letter-spacing:0.2em;color:rgba(201,168,76,0.3);">SOCIETY OF EXPLORERS</span>
              <br/>
              <a href="https://societyofexplorers.com/practice" style="font-size:11px;color:rgba(154,143,122,0.4);text-decoration:none;">Unsubscribe</a>
            </div>
          </div>
        `,
      });
      sent++;
    } catch {
      console.warn('[practice/daily-email] send failed');
      errors++;
    }

    // Rate limit: small delay between sends
    if (sent % 10 === 0) await new Promise(r => setTimeout(r, 200));
  }

  return privateJson({ sent, errors, total: members.length });
}

export const GET = handler;
