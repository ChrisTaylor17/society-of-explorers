import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 30;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const { sessionId, question, responses, memberId } = await req.json();

  if (!sessionId || !question || !responses?.length) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const analysisResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    system: 'Analyze these council responses and return ONLY valid JSON.',
    messages: [{
      role: 'user',
      content: `Question: "${question}"\n\nResponses:\n${responses.map((r: any) => `${r.thinker}: ${r.response}`).join('\n\n')}\n\nReturn JSON:\n{"votes":[{"thinker":"name","position":"AGREE|CHALLENGE|REFRAME|AMPLIFY","one_liner":"core point in under 10 words"}],"best_quote":"single most powerful sentence under 30 words","best_quote_thinker":"who said it","session_theme":"2-3 word theme"}`,
    }],
  });

  const analysisText = analysisResponse.content.find(b => b.type === 'text')?.text || '';
  let analysis: any;
  try {
    analysis = JSON.parse(analysisText.replace(/```json\n?|```/g, '').trim());
  } catch {
    const match = analysisText.match(/\{[\s\S]*\}/);
    analysis = match ? JSON.parse(match[0]) : { votes: [], best_quote: '', best_quote_thinker: '', session_theme: '' };
  }

  const slugBase = question.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).slice(0, 5).join('-');
  const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

  const thinkerResponses = responses.map((r: any) => {
    const vote = analysis.votes?.find((v: any) => v.thinker === r.thinker);
    return { ...r, vote_position: vote?.position || 'REFRAME', one_liner: vote?.one_liner || '' };
  });

  const { data: session } = await supabase.from('council_sessions').upsert({
    session_id: sessionId,
    member_id: memberId || null,
    question,
    thinker_responses: thinkerResponses,
    public_url_slug: slug,
    is_public: true,
  }, { onConflict: 'session_id' }).select().single();

  return NextResponse.json({
    session,
    analysis,
    publicUrl: `https://www.societyofexplorers.com/council/verdict/${slug}`,
    slug,
  });
}
