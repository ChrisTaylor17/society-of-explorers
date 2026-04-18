import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_CATEGORIES = [
  'identity','goal','challenge','value','preference',
  'relationship','emotional_pattern','milestone','commitment'
];

interface Fact {
  category: string;
  key: string;
  value: string;
  confidence: number;
}

export async function extractFactsFromAnswer(params: {
  memberId: string;
  sourceEpisodeId: string | null;
  question: string;
  answer: string;
}): Promise<number> {
  const { memberId, sourceEpisodeId, question, answer } = params;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You extract structured facts from a daily philosophical practice exchange.

Extract 0-3 durable facts about the person from their ANSWER (not the question).
Each fact must be a signal about who they are, what they want, what they believe,
or what they're struggling with — something still true a month from now.

Valid categories:
- identity (who they are, role, life stage)
- goal (what they're pursuing)
- challenge (what they're struggling with)
- value (what they care about deeply)
- preference (how they like to work/live/think)
- relationship (people in their life)
- emotional_pattern (recurring feelings or responses)
- milestone (recent life event)
- commitment (something they said they'd do)

Return ONLY valid JSON, no preamble, no markdown fences:
{"facts":[{"category":"...","key":"snake_case_id","value":"1-2 sentence fact","confidence":0.0-1.0}]}

Rules:
- confidence 0.9 = explicitly stated
- confidence 0.7 = strongly implied
- confidence below 0.6 = skip
- Never invent. If the answer is too short or generic, return {"facts":[]}
- key is a short identifier like "current_project" or "primary_fear"
- value is the fact itself, 1-2 sentences max, in your own words`,
      messages: [{
        role: 'user',
        content: `QUESTION: "${question}"\n\nANSWER: "${answer}"\n\nExtract durable facts.`
      }]
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    const cleaned = text.replace(/```json|```/g, '').trim();

    let parsed: { facts: Fact[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('extractFacts: JSON parse failed', cleaned.slice(0, 200));
      return 0;
    }

    if (!parsed.facts?.length) return 0;

    const rows = parsed.facts
      .filter(f => VALID_CATEGORIES.includes(f.category))
      .filter(f => f.key && f.value)
      .filter(f => typeof f.confidence === 'number' && f.confidence >= 0.6)
      .map(f => ({
        member_id: memberId,
        category: f.category,
        key: f.key.slice(0, 100),
        value: f.value.slice(0, 500),
        confidence: Math.min(1, Math.max(0, f.confidence)),
        source_episode_id: sourceEpisodeId,
      }));

    if (rows.length === 0) return 0;

    const { error } = await supabaseAdmin
      .from('user_semantic_memory')
      .insert(rows);

    if (error) {
      console.error('extractFacts: insert failed', error);
      return 0;
    }

    return rows.length;
  } catch (err) {
    console.error('extractFacts: exception', err);
    return 0;
  }
}
