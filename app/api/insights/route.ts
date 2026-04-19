import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function generateOpeningHeadline(
  displayName: string,
  facts: Array<{ value: string }>
): Promise<string | null> {
  if (!facts.length) return null;
  try {
    const bulleted = facts
      .slice(0, 12)
      .map(f => `- ${f.value}`)
      .join('\n');
    const res = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 120,
      system: `You write ONE sentence. The person below will read it the moment they open their wisdom profile. Either they feel "oh — they actually see me," or they close the tab. Make them feel seen.

WHAT TO WRITE:
- Name something specific the person would recognize about themselves — a tension they live with, a pull they haven't named, a thread that runs through the facts below. Not a summary. A perception.
- Weave across several facts. Never restate any single one verbatim. Notice what is underneath them.
- The tone of a friend who has been quietly paying attention for months — not a coach, not a horoscope, not a therapist.

HARD RULES:
- Second person. "You" — never "they," never "the user," never the person's name.
- Under 22 words. Shorter is more arresting.
- End with a period. Never an ellipsis, never a question mark.
- No greeting ("Hello," "Welcome"), no meta ("Based on...," "From what I've learned..."), no hedging ("seems," "appears," "may," "tends to").
- Do NOT open with: "There's something...", "I notice...", "What strikes me...", "It's clear...", "You seem..." — these betray the AI.
- No jargon, no diagnosis words, no "pattern," no "journey."

Return ONLY the sentence itself. No quotes, no preamble, no JSON, no label.`,
      messages: [{
        role: 'user',
        content: `Name: ${displayName}\n\nWhat we've learned about them:\n${bulleted}`,
      }],
    });
    const text = res.content.find(b => b.type === 'text')?.text ?? '';
    let cleaned = text.trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith('\u201C') && cleaned.endsWith('\u201D'))) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    if (!cleaned) return null;
    return cleaned.slice(0, 240);
  } catch (err) {
    console.error('[insights-opening-headline-failed]', err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberId = auth.memberId;

  // Semantic facts — active only, ordered for grouping. Join source episode
  // to surface which thinker originally authored the fact (for the avatar).
  const { data: factRows, error: factsError } = await supabaseAdmin
    .from('user_semantic_memory')
    .select('id, category, key, value, confidence, created_at, source_episode_id, source_episode:user_episodes!source_episode_id(thinker_id)')
    .eq('member_id', memberId)
    .is('valid_until', null)
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (factsError) {
    console.error('[insights-query-failed] semantic_memory', {
      message: factsError.message,
      code: (factsError as any).code,
      details: (factsError as any).details,
      memberId,
    });
  }

  // Episodes — last 30 rows, then group into threads by session_id
  const { data: episodeRows, error: episodesError } = await supabaseAdmin
    .from('user_episodes')
    .select('id, thinker_id, role, content, created_at, source, session_id')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (episodesError) {
    console.error('[insights-query-failed] episodes', {
      message: episodesError.message,
      code: (episodesError as any).code,
      details: (episodesError as any).details,
      memberId,
    });
  }

  // Group by session_id, preserving newest-first order (first encounter = newest)
  const threadsMap = new Map<string, any>();
  for (const ep of episodeRows || []) {
    const key = ep.session_id || `solo_${ep.id}`;
    if (!threadsMap.has(key)) {
      threadsMap.set(key, {
        session_id: ep.session_id,
        thinker_id: ep.thinker_id,
        source: ep.source,
        created_at: ep.created_at,
        user: null,
        assistant: null,
      });
    }
    const thread = threadsMap.get(key);
    if (ep.role === 'user') thread.user = { content: ep.content, created_at: ep.created_at };
    else if (ep.role === 'assistant') thread.assistant = { content: ep.content, created_at: ep.created_at };
    // Use the earliest/user timestamp as the thread timestamp when available
    if (ep.role === 'user') thread.created_at = ep.created_at;
  }

  const threads = Array.from(threadsMap.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  // Flatten the embedded thinker_id onto each fact for easy client rendering.
  const semanticFacts = (factRows || []).map((f: any) => ({
    id: f.id,
    category: f.category,
    key: f.key,
    value: f.value,
    confidence: f.confidence,
    created_at: f.created_at,
    source_episode_id: f.source_episode_id,
    thinker_id: f.source_episode?.thinker_id || null,
  }));

  const displayName = auth.member.display_name || 'Explorer';
  const openingHeadline = await generateOpeningHeadline(displayName, semanticFacts);

  return NextResponse.json({
    member: { id: auth.member.id, display_name: auth.member.display_name },
    semanticFacts,
    threads,
    openingHeadline,
  });
}
