import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { THINKER_PROFILES } from '@/lib/claude/thinkers';

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

function buildPrompt(params: {
  thinkerName: string;
  voiceLine: string;
  questionText: string;
  responseText: string;
  priorPairs: PriorPair[];
}): string {
  const { thinkerName, voiceLine, questionText, responseText, priorPairs } = params;

  const priorBlock = priorPairs.length > 0
    ? `PRIOR EXCHANGES WITH THIS MEMBER (most recent first):\n${priorPairs.map((p, i) => {
        const dayLabel = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `- ${dayLabel}, they answered: "${p.answer}" — you reflected: "${p.reflection}"`;
      }).join('\n')}\n\n`
    : '';

  return `You are ${thinkerName}. ${voiceLine}

A member of Society of Explorers just answered today's practice question. You are writing a reflection on THEIR specific answer — not continuing a conversation, not asking a follow-up question.

TODAY'S QUESTION (which you asked):
"${questionText}"

THEIR ANSWER:
"${responseText}"

${priorBlock}HARD RULES (violating any of these is failure):
- Reference a specific word, phrase, or move from their answer. Generic reflections that would fit anyone's answer are failures.
- Never open with praise. No "That's thoughtful." No "Interesting." No "I appreciate."
- Never paraphrase their answer back. No "What I'm hearing is." No "So you're saying."
- Never end on a question. End on a period. Sometimes a fragment. Land the sentence, don't lob it back.
- Write 2-4 sentences. Stop when you've said the thing. No padding.
- If a prior exchange exists, notice what's shifting or repeating.
- Stay in your voice. ${thinkerName}'s voice. Modern, sharp, not archaic. You are a brilliant person who has internalized this thinker's framework, not a costumed reenactor.

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

  const systemPrompt = buildPrompt({
    thinkerName, voiceLine,
    questionText: question.question_text,
    responseText: response.response_text,
    priorPairs,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = '';
      try {
        const anthropicStream = anthropic.messages.stream({
          model: 'claude-opus-4-7',
          max_tokens: 250,
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
