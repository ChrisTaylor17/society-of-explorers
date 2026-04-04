import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { buildSystemPrompt } from '@/lib/claude/thinkers';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const THINKER_KEYS = ['socrates', 'plato', 'nietzsche', 'aurelius', 'einstein', 'jobs'] as const;

async function classifyThinker(content: string): Promise<string> {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: `Classify this text into ONE category. Reply with ONLY the category word, nothing else.\nCategories: philosophy, ethics, science, creativity, metaphysics, will\nText: "${content.slice(0, 300)}"` }],
    });
    const category = (res.content[0].type === 'text' ? res.content[0].text : '').trim().toLowerCase();
    const map: Record<string, string> = { philosophy: 'socrates', ethics: 'aurelius', science: 'einstein', creativity: 'jobs', metaphysics: 'plato', will: 'nietzsche' };
    return map[category] || 'socrates';
  } catch {
    return 'socrates';
  }
}

export async function GET(req: NextRequest) {
  // Verify cron authorization
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    // Find open twiddles from last 12h with reactions but no thinker response yet
    const { data: candidates } = await supabaseAdmin
      .from('twiddles')
      .select('id, content, thinker_tags, author_id')
      .eq('thread_type', 'open')
      .eq('is_thinker_response', false)
      .is('parent_id', null)
      .gte('created_at', twelveHoursAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!candidates?.length) {
      return NextResponse.json({ responses_generated: 0, message: 'No eligible twiddles' });
    }

    // Filter to those with reactions and no existing thinker response
    const eligible: typeof candidates = [];
    for (const tw of candidates) {
      const { count: reactionCount } = await supabaseAdmin
        .from('twiddle_reactions')
        .select('id', { count: 'exact', head: true })
        .eq('twiddle_id', tw.id);

      if ((reactionCount || 0) < 1) continue;

      const { count: thinkerCount } = await supabaseAdmin
        .from('twiddles')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', tw.id)
        .eq('is_thinker_response', true);

      if ((thinkerCount || 0) > 0) continue;

      eligible.push({ ...tw, _reactions: reactionCount || 0 } as any);
    }

    // Sort by reactions descending, take top 3
    eligible.sort((a: any, b: any) => (b._reactions || 0) - (a._reactions || 0));
    const top = eligible.slice(0, 3);

    let generated = 0;

    for (const tw of top) {
      // Determine thinker
      let thinkerId: string;
      if (tw.thinker_tags?.length) {
        thinkerId = tw.thinker_tags[0];
        if (!THINKER_KEYS.includes(thinkerId as any)) thinkerId = 'socrates';
      } else {
        thinkerId = await classifyThinker(tw.content || '');
      }

      // Build system prompt
      let systemPrompt = buildSystemPrompt(thinkerId);
      systemPrompt += '\n\nYou are responding autonomously to a TwiddleTwattle post that caught the community\'s attention. Keep your response to 2-4 sentences. Be sharp, specific, in character. This is a proactive contribution, not a requested one — make it worth the interruption.';

      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: systemPrompt,
          messages: [{ role: 'user', content: tw.content || 'No content' }],
        });

        let responseText = response.content.find(b => b.type === 'text')?.text || '';
        responseText = responseText
          .replace(/^\[?\w[\w-]*\]?:\s*/i, '')
          .replace(/^(socrates|plato|nietzsche|aurelius|einstein|jobs):\s*/i, '')
          .trim();

        if (responseText) {
          await supabaseAdmin.from('twiddles').insert({
            author_id: null,
            content: responseText,
            twiddle_type: 'text',
            thread_type: 'open',
            thinker_tags: [thinkerId],
            parent_id: tw.id,
            root_id: tw.id,
            is_thinker_response: true,
            thinker_key: thinkerId,
          });
          generated++;
          console.log(`Cron: ${thinkerId} responded to twiddle ${tw.id}`);
        }
      } catch (err) {
        console.error(`Cron: Failed to generate response for ${tw.id}:`, err);
      }
    }

    return NextResponse.json({ responses_generated: generated, checked: candidates.length, eligible: eligible.length });
  } catch (err) {
    console.error('Twiddle cron error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
