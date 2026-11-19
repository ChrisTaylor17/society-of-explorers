import { NextResponse } from 'next/server';
import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const DROP_THINKERS = ['socrates', 'nietzsche', 'aurelius', 'plato', 'einstein', 'jobs'];
const THINKER_NAMES: Record<string, string> = {
  socrates: 'Socrates', plato: 'Plato', nietzsche: 'Nietzsche',
  aurelius: 'Marcus Aurelius', einstein: 'Einstein', jobs: 'Steve Jobs',
};

export async function GET() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const thinkerId = DROP_THINKERS[dayOfYear % DROP_THINKERS.length];

  const anthropic = createAnthropicClient();
  const response = await anthropic.messages.create({
    model: resolveClaudeModel('content', 'claude-sonnet-4-20250514'),
    max_tokens: 300,
    messages: [{ role: 'user', content: `You are ${THINKER_NAMES[thinkerId]}. Drop a sacred provocation into the Society of Explorers salon today. Not a lesson. Not advice. A DISRUPTION. Something that makes them stop, reconsider, see differently. 3-4 sentences maximum. No preamble. Hit immediately. Today is day ${dayOfYear} of the year.` }],
  });

  const dropText = response.content[0].type === 'text' ? response.content[0].text : '';

  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin.from('salon_messages').insert({
    salon_id: 'general', thinker_id: thinkerId, content: dropText,
    message_type: 'thinker', sender_type: 'thinker', sender_name: THINKER_NAMES[thinkerId],
  });

  return NextResponse.json({ success: true, thinker: thinkerId, drop: dropText });
}
