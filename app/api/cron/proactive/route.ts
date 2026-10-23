import { NextRequest } from 'next/server';
import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getResend } from '@/lib/email/resend';
import { privateJson } from '@/lib/http/routeError';
import { getThinkerContext } from '@/lib/memory/sharedMemory';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const COUNCIL_PROMPTS: Record<string, string> = {
  socrates: 'You are Socrates — you find the question behind the question.',
  plato: 'You are Plato — you see systems and structures.',
  aurelius: 'You are Marcus Aurelius — you cut through noise to what matters.',
  nietzsche: 'You are Nietzsche — you challenge comfort zones.',
  einstein: 'You are Einstein — you find the elegant solution.',
  jobs: 'You are Steve Jobs — you obsess over what the user should FEEL.',
};

function proactiveEmailNotificationsEnabled() {
  return process.env.PROACTIVE_EMAIL_NOTIFICATIONS_ENABLED === 'true';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: triggers, error: triggersError } = await supabase
    .from('proactive_triggers')
    .select('id, member_id, suggested_thinker, context_summary, trigger_type')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .limit(20);

  if (triggersError) {
    console.warn('[proactive] trigger query failed');
    return privateJson({ error: 'Failed to load proactive triggers' }, { status: 500 });
  }

  if (!triggers || triggers.length === 0) {
    return privateJson({ processed: 0 });
  }

  let processed = 0;

  for (const trigger of triggers) {
    try {
      // Get member email
      const { data: member } = await supabase
        .from('members')
        .select('display_name, supabase_auth_id')
        .eq('id', trigger.member_id)
        .single();

      let email: string | null = null;
      if (member?.supabase_auth_id) {
        const { data: authUser } = await supabase.auth.admin.getUserById(member.supabase_auth_id);
        email = authUser?.user?.email || null;
      }

      const prompt = COUNCIL_PROMPTS[trigger.suggested_thinker] || COUNCIL_PROMPTS.socrates;
      let context = '';
      try {
        context = await getThinkerContext(trigger.member_id, trigger.suggested_thinker, trigger.context_summary, { isCouncil: false });
      } catch {}

      const anthropic = createAnthropicClient();
      const model = resolveClaudeModel('content', 'claude-sonnet-4-20250514');
      const response = await anthropic.messages.create({
        model,
        max_tokens: 150,
        system: `${prompt}\n\nYou are proactively reaching out to check in. Be warm, specific, and reference what you know. 2-3 sentences only. This is a notification, not a conversation.\n\n${context}`,
        messages: [{ role: 'user', content: `Generate a proactive ${trigger.trigger_type} check-in about: ${trigger.context_summary}` }],
      });

      const message = response.content.find(b => b.type === 'text')?.text || '';

      await sendProactiveEmail({
        email,
        thinkerId: trigger.suggested_thinker,
        message,
      });

      await supabase.from('proactive_triggers')
        .update({ status: 'delivered', delivered_at: new Date().toISOString(), message_sent: message })
        .eq('id', trigger.id);

      processed++;
    } catch {
      console.warn('[proactive] trigger failed', trigger.id);
      await supabase.from('proactive_triggers')
        .update({ status: 'failed' })
        .eq('id', trigger.id);
    }
  }

  console.log(`[proactive] Processed ${processed} triggers`);
  return privateJson({ processed });
}

async function sendProactiveEmail(input: {
  email: string | null;
  thinkerId: string;
  message: string;
}) {
  if (!input.email || !proactiveEmailNotificationsEnabled()) return;

  try {
    const thinkerName = input.thinkerId.charAt(0).toUpperCase() + input.thinkerId.slice(1);
    const safeThinkerName = escapeHtml(thinkerName);
    const safeMessage = escapeHtml(input.message);
    const resend = getResend();
    await resend.emails.send({
      from: 'Society of Explorers <notifications@societyofexplorers.com>',
      to: input.email,
      subject: `${thinkerName} has a question for you`,
      html: `<div style="background:#0a0a0a;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;">
        <div style="font-size:9px;letter-spacing:0.4em;color:#c9a84c;margin-bottom:12px;">SOCIETY OF EXPLORERS</div>
        <div style="font-size:11px;letter-spacing:0.18em;color:rgba(201,168,76,0.65);margin-bottom:24px;">${safeThinkerName}</div>
        <p style="font-size:18px;line-height:1.8;color:rgba(245,240,232,0.85);margin:0 0 24px;">${safeMessage}</p>
        <a href="https://www.societyofexplorers.com/council" style="display:inline-block;padding:12px 28px;background:#c9a84c;color:#0a0a0a;text-decoration:none;font-size:11px;letter-spacing:0.15em;">RESPOND TO THE COUNCIL</a>
        <div style="margin-top:32px;height:1px;background:rgba(201,168,76,0.15);"></div>
        <div style="margin-top:16px;font-size:11px;color:rgba(245,240,232,0.3);">92B South St &middot; Boston</div>
      </div>`,
    });
  } catch {
    console.warn('[proactive] notification email skipped');
  }
}
