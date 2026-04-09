import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getThinkerContext } from '@/lib/memory/sharedMemory';

export const runtime = 'nodejs';
export const maxDuration = 60;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const COUNCIL_PROMPTS: Record<string, string> = {
  socrates: 'You are Socrates — you find the question behind the question.',
  plato: 'You are Plato — you see systems and structures.',
  aurelius: 'You are Marcus Aurelius — you cut through noise to what matters.',
  nietzsche: 'You are Nietzsche — you challenge comfort zones.',
  einstein: 'You are Einstein — you find the elegant solution.',
  jobs: 'You are Steve Jobs — you obsess over what the user should FEEL.',
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: triggers } = await supabase
    .from('proactive_triggers')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .limit(20);

  if (!triggers || triggers.length === 0) {
    return NextResponse.json({ processed: 0 });
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

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: `${prompt}\n\nYou are proactively reaching out to check in. Be warm, specific, and reference what you know. 2-3 sentences only. This is a notification, not a conversation.\n\n${context}`,
        messages: [{ role: 'user', content: `Generate a proactive ${trigger.trigger_type} check-in about: ${trigger.context_summary}` }],
      });

      const message = response.content.find(b => b.type === 'text')?.text || '';

      if (process.env.RESEND_API_KEY && email) {
        const thinkerName = trigger.suggested_thinker.charAt(0).toUpperCase() + trigger.suggested_thinker.slice(1);
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Society of Explorers <notifications@societyofexplorers.com>',
            to: email,
            subject: `${thinkerName} has a question for you`,
            html: `<div style="background:#0a0a0a;color:#f5f0e8;padding:40px;font-family:Georgia,serif;max-width:500px;">
              <div style="font-size:9px;letter-spacing:0.4em;color:#c9a84c;margin-bottom:24px;">SOCIETY OF EXPLORERS</div>
              <p style="font-size:18px;line-height:1.8;color:rgba(245,240,232,0.85);margin:0 0 24px;">${message}</p>
              <a href="https://www.societyofexplorers.com/council" style="display:inline-block;padding:12px 28px;background:#c9a84c;color:#0a0a0a;text-decoration:none;font-size:11px;letter-spacing:0.15em;">RESPOND TO THE COUNCIL</a>
              <div style="margin-top:32px;height:1px;background:rgba(201,168,76,0.15);"></div>
              <div style="margin-top:16px;font-size:11px;color:rgba(245,240,232,0.3);">92B South St &middot; Boston</div>
            </div>`,
          }),
        }).catch(console.error);
      }

      await supabase.from('proactive_triggers')
        .update({ status: 'delivered', delivered_at: new Date().toISOString(), message_sent: message })
        .eq('id', trigger.id);

      processed++;
    } catch (err) {
      console.error('[proactive] Trigger failed:', trigger.id, err);
      await supabase.from('proactive_triggers')
        .update({ status: 'failed' })
        .eq('id', trigger.id);
    }
  }

  console.log(`[proactive] Processed ${processed} triggers`);
  return NextResponse.json({ processed });
}
