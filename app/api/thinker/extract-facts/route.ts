import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { memberId, thinkerId, messages } = await req.json();

  if (!memberId || !thinkerId || !messages?.length) {
    return NextResponse.json({ error: 'memberId, thinkerId, and messages required' }, { status: 400 });
  }

  const transcript = messages
    .map((m: any) => `${m.role === 'user' ? 'Member' : thinkerId}: ${m.content}`)
    .join('\n\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `Extract key facts from this conversation. Return ONLY valid JSON with these fields:

{
  "life_facts": { "key": "value" pairs — job, location, relationships, current_projects, goals, struggles, background },
  "intellectual_interests": ["topics they showed interest in"],
  "emotional_patterns": ["observed emotional patterns"],
  "commitments": ["specific things they said they would do"]
}

Only extract what's clearly stated. Don't infer. Return ONLY the JSON object.`,
      messages: [{ role: 'user', content: `CONVERSATION:\n${transcript}` }],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '';

    let extracted: any;
    try {
      extracted = JSON.parse(text.trim());
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { extracted = JSON.parse(match[0]); } catch {
          return NextResponse.json({ error: 'Failed to parse extraction' }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: 'No JSON in response' }, { status: 500 });
      }
    }

    // Fetch existing memory
    const { data: existing } = await supabaseAdmin
      .from('thinker_memory')
      .select('life_facts, intellectual_interests, emotional_patterns, commitments')
      .eq('member_id', memberId)
      .eq('thinker_id', thinkerId)
      .single();

    const mergedFacts = { ...(existing?.life_facts || {}), ...(extracted.life_facts || {}) };
    const mergedInterests = [...new Set([...(existing?.intellectual_interests || []), ...(extracted.intellectual_interests || [])])].slice(-15);
    const mergedPatterns = [...new Set([...(existing?.emotional_patterns || []), ...(extracted.emotional_patterns || [])])].slice(-8);
    const mergedCommitments = [...new Set([...(existing?.commitments || []), ...(extracted.commitments || [])])].slice(-10);

    if (existing) {
      await supabaseAdmin
        .from('thinker_memory')
        .update({
          life_facts: mergedFacts,
          intellectual_interests: mergedInterests,
          emotional_patterns: mergedPatterns,
          commitments: mergedCommitments,
          updated_at: new Date().toISOString(),
        })
        .eq('member_id', memberId)
        .eq('thinker_id', thinkerId);
    } else {
      await supabaseAdmin
        .from('thinker_memory')
        .insert({
          member_id: memberId,
          thinker_id: thinkerId,
          summary: '',
          message_count: 0,
          life_facts: mergedFacts,
          intellectual_interests: mergedInterests,
          emotional_patterns: mergedPatterns,
          commitments: mergedCommitments,
        });
    }

    return NextResponse.json({ success: true, extracted, merged: { life_facts: mergedFacts, intellectual_interests: mergedInterests, commitments: mergedCommitments } });
  } catch (err) {
    console.error('Fact extraction error:', err);
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });
  }
}
