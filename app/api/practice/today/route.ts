import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const THINKERS = [
  { id: 'socrates', name: 'Socrates', lens: 'You find the question behind the question.' },
  { id: 'plato', name: 'Plato', lens: 'You see systems and structures beneath the surface.' },
  { id: 'aurelius', name: 'Marcus Aurelius', lens: 'You cut through noise to what is in our control.' },
  { id: 'nietzsche', name: 'Nietzsche', lens: 'You challenge comfort zones and comfortable lies.' },
  { id: 'einstein', name: 'Einstein', lens: 'You find elegant simplifications through analogy.' },
  { id: 'jobs', name: 'Steve Jobs', lens: 'You focus on what the user should feel.' },
];

function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
}

function pickThinker(): typeof THINKERS[number] {
  const today = new Date();
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  return THINKERS[dayOfYear % THINKERS.length];
}

export async function GET() {
  const today = getTodayET();

  // Check if today's question exists
  const { data: existing } = await supabase.from('daily_questions').select('*').eq('date', today).single();
  if (existing) return NextResponse.json({ question: existing });

  // Generate a new question
  const thinker = pickThinker();
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: `You are ${thinker.name}, the AI thinker from Society of Explorers. ${thinker.lens} Generate ONE philosophical question for today's daily practice. The question should be answerable in 280 characters or less, provoke genuine reflection, and reflect your unique perspective. Respond with ONLY a JSON object: {"question": "...", "context": "A 1-sentence note on why you're asking this today."}`,
      messages: [{ role: 'user', content: 'Generate today\'s daily practice question.' }],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '';
    let parsed: { question: string; context: string };
    try {
      parsed = JSON.parse(text.replace(/```json\n?|```/g, '').trim());
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { question: text.slice(0, 200), context: '' };
    }

    const { data: question } = await supabase.from('daily_questions').insert({
      thinker_id: thinker.id,
      question_text: parsed.question,
      question_context: parsed.context,
      date: today,
    }).select().single();

    return NextResponse.json({ question });
  } catch (err) {
    console.error('[practice/today] Generation failed:', err);
    return NextResponse.json({ question: null, error: 'Failed to generate question' }, { status: 500 });
  }
}
