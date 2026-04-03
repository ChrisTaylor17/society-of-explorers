import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getBook } from '@/lib/books/catalog';
import { buildSeminarPrompt } from '@/lib/books/prompts';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { bookId, passage, thinkerId, discussion } = await req.json();
    const book = getBook(bookId);
    if (!book) return new Response(JSON.stringify({ error: 'Book not found' }), { status: 404 });

    const prompt = buildSeminarPrompt(thinkerId, book.title, passage, discussion);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = '';
        try {
          const s = anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
          });
          s.on('text', (text) => {
            fullText += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
          });
          await s.finalMessage();
        } catch {}
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, response: fullText })}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
