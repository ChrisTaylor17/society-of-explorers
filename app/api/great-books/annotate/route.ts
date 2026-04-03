import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getBook } from '@/lib/books/catalog';
import { buildAnnotationPrompt } from '@/lib/books/prompts';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { bookId, passage, thinkerId, question, memberId } = await req.json();
    const book = getBook(bookId);
    if (!book) return new Response(JSON.stringify({ error: 'Book not found' }), { status: 404 });

    const prompt = buildAnnotationPrompt(thinkerId, book.title, book.author, passage, question);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullText = '';
          const anthropicStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 400,
            messages: [{ role: 'user', content: prompt }],
          });

          anthropicStream.on('text', (text) => {
            fullText += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
          });

          await anthropicStream.finalMessage();

          // Save highlight + annotation
          if (memberId) {
            const { error: hlError } = await supabaseAdmin.from('book_highlights').insert({
              member_id: memberId,
              book_id: bookId,
              passage,
              thinker_id: thinkerId,
              annotation: fullText,
              question: question || null,
            });
            if (hlError) console.warn('Highlight save failed:', hlError);
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, response: fullText })}\n\n`));
          controller.close();
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Failed', done: true })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
