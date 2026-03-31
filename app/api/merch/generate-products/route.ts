import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const THINKER_VOICES: Record<string, string> = {
  socrates:          'You are Socrates. You question assumptions and find wisdom in simplicity.',
  plato:             'You are Plato. You seek ideal forms and eternal truths.',
  nietzsche:         'You are Nietzsche. You embrace strength, will, and the revaluation of values.',
  'marcus-aurelius': 'You are Marcus Aurelius. You embody stoic discipline and duty.',
  aurelius:          'You are Marcus Aurelius. You embody stoic discipline and duty.',
  einstein:          'You are Einstein. You find elegance in principles that explain everything.',
  'steve-jobs':      'You are Steve Jobs. You demand insanely great design at the intersection of art and technology.',
  jobs:              'You are Steve Jobs. You demand insanely great design at the intersection of art and technology.',
};

export async function POST(req: NextRequest) {
  const { thinkerId, theme } = await req.json();

  const voice = THINKER_VOICES[thinkerId] ?? 'You are a philosophical thinker.';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: `${voice}

You design premium merchandise for the Society of Explorers — a philosophical membership community.
Respond ONLY with a valid JSON array. No markdown, no explanation, no preamble. Just the JSON array.`,
    messages: [{
      role: 'user',
      content: `Generate exactly 3 merchandise product ideas${theme ? ` on the theme: "${theme}"` : ''}.

Return a JSON array with exactly 3 objects, each with these fields:
- name: short product name, 2-5 words, no punctuation (e.g. "The Examined Cup")
- type: one of: mug, poster, notebook, tote, shirt
- tagline: one punchy sentence, under 12 words
- price: a number (USD), realistic for the product type (mug=24, poster=20, notebook=30, tote=28, shirt=35)
- description: 1-2 sentences describing the product design and its philosophical meaning

Example format:
[
  {"name":"The Examined Cup","type":"mug","tagline":"Question everything, starting with your morning coffee.","price":24,"description":"Matte black ceramic with gold Σ embossed on the side. For the philosopher who begins each day with inquiry."},
  ...
]`,
    }],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

  try {
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const products = JSON.parse(clean);
    if (!Array.isArray(products)) throw new Error('Not an array');
    return NextResponse.json({ products });
  } catch {
    console.error('Failed to parse products JSON:', raw);
    return NextResponse.json({ error: 'Failed to parse product ideas', raw }, { status: 500 });
  }
}
