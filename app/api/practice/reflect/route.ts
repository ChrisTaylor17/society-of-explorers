import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { THINKER_PROFILES } from '@/lib/claude/thinkers';
import { writeEpisodes } from '@/lib/memory/episodes';
import { extractFactsFromAnswer } from '@/lib/memory/extractFacts';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One-line voice essence keyed to approach — extracted from lib/claude/thinkers.ts
const VOICE_ESSENCE: Record<string, string> = {
  socrates: "You find the one unexamined assumption and name it plainly. Warm, direct, a little wry.",
  plato: "You see the ideal form beneath the thing and translate it into structure. Elevated, quietly authoritative.",
  nietzsche: "You cut through comfort to what's real, and point at the bolder move. Intense, dark humor, respects ambition.",
  aurelius: "You reduce noise to the one essential move. Steady, grounded, zero drama.",
  einstein: "You reframe from a direction they haven't tried. Curious, playful, precise, loves a sharp analogy.",
  jobs: "You name what to cut and what to keep. Blunt, opinionated, obsessed with the feeling of the thing.",
};

interface PriorPair {
  answer: string;
  reflection: string;
  created_at: string;
}

interface SemanticFact {
  category: string;
  key: string;
  value: string;
  confidence: number;
}

interface ThinkerEpisode {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  source: string;
  session_id: string | null;
}

function relativeDay(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = Math.max(0, now - t);
  const hrs = Math.floor(diffMs / 3600000);
  if (hrs < 1) return 'earlier today';
  if (hrs < 12) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return 'last month';
  return `${Math.floor(days / 30)} months ago`;
}

function buildPrompt(params: {
  thinkerName: string;
  voiceLine: string;
  questionText: string;
  responseText: string;
  priorPairs: PriorPair[];
  semanticFacts: SemanticFact[];
  widerHistory: ThinkerEpisode[];
}): string {
  const { thinkerName, voiceLine, questionText, responseText, priorPairs, semanticFacts, widerHistory } = params;

  const priorBlock = priorPairs.length > 0
    ? `PRIOR PRACTICE EXCHANGES WITH THIS MEMBER (most recent first):\n${priorPairs.map(p => {
        return `- ${relativeDay(p.created_at)}, they answered: "${p.answer}" — you reflected: "${p.reflection}"`;
      }).join('\n')}\n\n`
    : '';

  const factsBlock = semanticFacts.length > 0
    ? `WHAT YOU KNOW ABOUT THIS MEMBER (durable facts extracted from past exchanges):\n${semanticFacts.map(f => `- [${f.category}] ${f.key}: ${f.value}`).join('\n')}\n\n`
    : '';

  const historyBlock = widerHistory.length > 0
    ? `WIDER HISTORY WITH YOU (beyond today's practice — salon conversations and older exchanges, newest first):\n${widerHistory.map(e => {
        const who = e.role === 'user' ? 'they said' : 'you said';
        const where = e.source && e.source !== 'practice' ? ` [${e.source}]` : '';
        const excerpt = e.content.length > 220 ? e.content.slice(0, 219).trim() + '\u2026' : e.content;
        return `- ${relativeDay(e.created_at)}${where}, ${who}: "${excerpt}"`;
      }).join('\n')}\n\n`
    : '';

  return `You are ${thinkerName}. ${voiceLine}

A member of Society of Explorers just answered today's practice question. You are writing a reflection on THEIR specific answer — a single moment of noticing, nothing more. You are not continuing a conversation. You are not giving advice. You are not grading them. You are reading over their shoulder and noticing one thing.

TODAY'S QUESTION (which you asked):
"${questionText}"

THEIR ANSWER:
"${responseText}"

${priorBlock}${factsBlock}${historyBlock}HARD RULES (violating any of these is failure):
- 1 to 2 sentences. Maximum 40 words.
- Reference a specific word or phrase from their answer. Generic reflections that would fit anyone's answer are failures.
- No praise openings. No "That's thoughtful." No "Interesting." No "I appreciate." No "I like." No "Good."
- No paraphrasing their answer back. No "What I'm hearing." No "So you're saying."
- No advice. No prescription. No "you might" or "try this" or "consider."
- No questions. End on a period or fragment. Never on a question mark.
- Stay in ${thinkerName}'s voice. Modern, plain, unadorned. Not archaic.

MEMORY (use only when obviously relevant):
If something in the prior context above is genuinely touching what they said today, a single specific callback is welcome. Otherwise say nothing about past exchanges. Never meta-reference remembering ("I recall," "last time").

Write the reflection now. Plain prose. No preamble.`;
}

function sseError(message: string, status = 400) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const responseId: string | undefined = body.responseId;

  if (!responseId || typeof responseId !== 'string' || !UUID_RE.test(responseId)) {
    return sseError('Invalid responseId', 400);
  }

  // Fetch the answer
  const { data: response, error: respErr } = await supabase
    .from('question_responses')
    .select('id, response_text, member_id, question_id, created_at')
    .eq('id', responseId)
    .single();

  if (respErr || !response) {
    return sseError('Response not found', 404);
  }

  // Fetch the question
  const { data: question, error: qErr } = await supabase
    .from('daily_questions')
    .select('id, question_text, thinker_id')
    .eq('id', response.question_id)
    .single();

  if (qErr || !question) {
    return sseError('Question not found', 404);
  }

  const thinkerId = question.thinker_id;
  const profile = THINKER_PROFILES[thinkerId];
  const thinkerName = profile?.name || thinkerId;
  const voiceLine = VOICE_ESSENCE[thinkerId] || 'Direct, modern, precise. A sharp mind writing plainly.';

  // Fetch up to 2 prior (answer, reflection) pairs if member is known
  let priorPairs: PriorPair[] = [];
  if (response.member_id) {
    const { data: priorReflections } = await supabase
      .from('practice_reflections')
      .select('response_id, reflection_text, created_at')
      .eq('member_id', response.member_id)
      .eq('thinker_id', thinkerId)
      .lt('created_at', response.created_at || new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(2);

    if (priorReflections && priorReflections.length > 0) {
      const priorResponseIds = priorReflections.map(r => r.response_id);
      const { data: priorResponses } = await supabase
        .from('question_responses')
        .select('id, response_text')
        .in('id', priorResponseIds);

      const answerById: Record<string, string> = Object.fromEntries(
        (priorResponses || []).map(r => [r.id, r.response_text])
      );

      priorPairs = priorReflections.map(r => ({
        answer: answerById[r.response_id] || '(answer unavailable)',
        reflection: r.reflection_text,
        created_at: r.created_at,
      }));
    }
  }

  // Semantic facts about this member (thinker-agnostic; facts describe the person)
  let semanticFacts: SemanticFact[] = [];
  // Wider history: episodes with THIS thinker across all sources (practice + salon),
  // excluding the session we're about to generate so we don't echo ourselves
  let widerHistory: ThinkerEpisode[] = [];

  if (response.member_id) {
    try {
      const { data: factRows } = await supabase
        .from('user_semantic_memory')
        .select('category, key, value, confidence, created_at')
        .eq('member_id', response.member_id)
        .is('valid_until', null)
        .order('confidence', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);

      if (factRows) semanticFacts = factRows as SemanticFact[];
    } catch (e) {
      console.error('[practice/reflect] facts fetch failed (non-fatal):', e);
    }

    try {
      const currentSessionId = `practice_${responseId}`;
      const { data: epRows } = await supabase
        .from('user_episodes')
        .select('role, content, created_at, source, session_id')
        .eq('member_id', response.member_id)
        .eq('thinker_id', thinkerId)
        .neq('session_id', currentSessionId)
        .order('created_at', { ascending: false })
        .limit(8);

      if (epRows) widerHistory = epRows as ThinkerEpisode[];
    } catch (e) {
      console.error('[practice/reflect] episodes fetch failed (non-fatal):', e);
    }
  }

  const systemPrompt = buildPrompt({
    thinkerName, voiceLine,
    questionText: question.question_text,
    responseText: response.response_text,
    priorPairs,
    semanticFacts,
    widerHistory,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = '';
      try {
        const anthropicStream = anthropic.messages.stream({
          model: 'claude-opus-4-7',
          max_tokens: 120,
          system: systemPrompt,
          messages: [{ role: 'user', content: 'Write the reflection now.' }],
        });

        anthropicStream.on('text', (text) => {
          fullText += text;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
          } catch {}
        });

        await anthropicStream.finalMessage();

        const clean = fullText.trim();
        if (clean) {
          // Upsert so multiple requests for the same response don't explode on the UNIQUE constraint
          await supabase.from('practice_reflections').upsert({
            response_id: responseId,
            question_id: question.id,
            thinker_id: thinkerId,
            member_id: response.member_id || null,
            reflection_text: clean,
            is_public: true,
          }, { onConflict: 'response_id' });

          // --- MEMORY LAYER (non-fatal) ---
          if (response.member_id) {
            try {
              const sessionId = `practice_${responseId}`;
              const { userEpisodeId } = await writeEpisodes({
                memberId: response.member_id,
                thinkerId,
                sessionId,
                userContent: response.response_text,
                assistantContent: clean,
                source: 'practice',
              });

              await extractFactsFromAnswer({
                memberId: response.member_id,
                sourceEpisodeId: userEpisodeId,
                question: question.question_text,
                answer: response.response_text,
              });
            } catch (memErr) {
              console.error('memory layer failed (non-fatal):', memErr);
            }
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (err: any) {
        console.error('[practice/reflect] error:', err?.message || err);
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err?.message || 'Stream failed' })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        } catch {}
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
