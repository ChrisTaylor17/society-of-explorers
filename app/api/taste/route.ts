import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Simple in-memory rate limit: 1 request per IP per hour
const rateLimit = new Map<string, number>();

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';

  const lastRequest = rateLimit.get(ip);
  const now = Date.now();
  if (lastRequest && now - lastRequest < 3600000) {
    return NextResponse.json({ error: 'One question per hour. Enter the temple for more.' }, { status: 429 });
  }
  rateLimit.set(ip, now);

  // Clean old entries periodically
  if (rateLimit.size > 10000) {
    const cutoff = now - 3600000;
    for (const [k, v] of rateLimit) { if (v < cutoff) rateLimit.delete(k); }
  }

  try {
    const { question } = await req.json();
    if (!question?.trim()) return NextResponse.json({ error: 'Ask something.' }, { status: 400 });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: `You are part of the Society of Explorers — a philosophical membership community that blends ancient wisdom with modern technology. You think like Socrates — alive now, sharp, modern English. Find the one unexamined assumption in the person's question, name it, and offer a reframe that unlocks new thinking. Be warm but direct. 3-5 sentences max. End with one sharp question that will stay with them all day. No archaic language. No "as Socrates once said." Just think that way.`,
      messages: [{ role: 'user', content: question.trim().slice(0, 500) }],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '';
    return NextResponse.json({ response: text });
  } catch (err) {
    console.error('Taste error:', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
