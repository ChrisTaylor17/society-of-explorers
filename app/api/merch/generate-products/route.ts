import { NextRequest } from 'next/server';
import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';

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
  const access = await getMovementAccess(req);
  if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { thinkerId?: unknown; theme?: unknown };
  const thinkerId = typeof body.thinkerId === 'string' ? body.thinkerId : 'socrates';
  const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, 200) : '';

  const voice = THINKER_VOICES[thinkerId] ?? 'You are a philosophical thinker.';

  const anthropic = createAnthropicClient();
  const model = resolveClaudeModel('content', 'claude-sonnet-4-20250514');
  const message = await anthropic.messages.create({
    model,
    max_tokens: 400,
    system: `${voice}

You design premium merchandise for the Society of Explorers.
Respond ONLY with valid JSON. No markdown, no explanation. Just the JSON object.`,
    messages: [{
      role: 'user',
      content: `Generate exactly 1 merchandise product idea${theme ? ` on the theme: "${theme}"` : ''}.

Return a single JSON object with these fields:
- name: short product name, 2-5 words, no punctuation (e.g. "The Examined Cup")
- type: one of: mug, poster, notebook, tote, shirt
- tagline: one punchy sentence, under 12 words
- price: realistic USD price (mug=24, poster=20, notebook=30, tote=28, shirt=35)
- description: 1-2 sentences describing the design and its philosophical meaning

Example:
{"name":"The Examined Cup","type":"mug","tagline":"Question everything, starting with your morning coffee.","price":24,"description":"Matte black ceramic with gold Σ embossed on the side."}`,
    }],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
  try {
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const product = JSON.parse(clean);
    return privateJson({ product });
  } catch {
    return privateJson({ error: 'Failed to parse product' }, { status: 500 });
  }
}
