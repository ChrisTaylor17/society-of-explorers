import { NextRequest } from 'next/server';
import { createAnthropicClient, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getBook } from '@/lib/books/catalog';
import { buildAnnotationPrompt } from '@/lib/books/prompts';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson, privateEventStreamHeaders } from '@/lib/http/routeError';
import { limitModelCall } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    let body: unknown;
    try { body = await req.json(); }
    catch { return privateJson({ error: 'Invalid JSON body' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return privateJson({ error: 'Invalid annotation request' }, { status: 400 });
    }
    const { bookId, passage, thinkerId, question, memberId } = body as Record<string, unknown>;
    if (typeof bookId !== 'string' || !bookId || bookId.length > 100 ||
        typeof passage !== 'string' || !passage.trim() || passage.length > 12000 ||
        typeof thinkerId !== 'string' || !thinkerId || thinkerId.length > 80 ||
        (question != null && (typeof question !== 'string' || question.length > 2000))) {
      return privateJson({ error: 'Invalid annotation request' }, { status: 400 });
    }
    // Preserve the legacy opt-in: the current book page omits memberId and does not save.
    // The supplied value can request saving, but can never select the storage owner.
    const saveHighlight = memberId != null && memberId !== '';
    if (saveHighlight && memberId !== auth.memberId) {
      return privateJson({ error: 'Forbidden' }, { status: 403 });
    }
    const book = getBook(bookId);
    if (!book) return privateJson({ error: 'Book not found' }, { status: 404 });
    const limited = limitModelCall(req, auth.memberId, 'book-annotation');
    if (limited) return privateJson({ error: 'Too many requests, please slow down' }, {
      status: 429, headers: { 'Retry-After': limited.headers.get('Retry-After') || '1' },
    });

    const prompt = buildAnnotationPrompt(thinkerId, book.title, book.author, passage, question ?? undefined);

    const encoder = new TextEncoder();
    const anthropic = createAnthropicClient();
    const model = resolveClaudeModel('content', 'claude-sonnet-4-20250514');
    const stream = new ReadableStream({
      async start(controller) {
        let saveAttempted = false;
        let saved = false;
        try {
          let fullText = '';
          const anthropicStream = anthropic.messages.stream({
            model,
            max_tokens: 150,
            messages: [{ role: 'user', content: prompt }],
          });

          anthropicStream.on('text', (text) => {
            fullText += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
          });

          await anthropicStream.finalMessage();

          if (saveHighlight) {
            // A delayed generation must not persist under a now-missing/different identity.
            const current = await getAuthenticatedMember(req);
            if (current?.memberId !== auth.memberId) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Session changed; annotation was not saved', saved: false, done: true })}\n\n`));
              controller.close();
              return;
            }
            const supabaseAdmin = getSupabaseAdmin();
            saveAttempted = true;
            const { error: hlError } = await supabaseAdmin.from('book_highlights').insert({
              member_id: auth.memberId,
              book_id: bookId,
              passage,
              thinker_id: thinkerId,
              annotation: fullText,
              question: question || null,
            });
            if (hlError) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Annotation save could not be confirmed', saved: null, done: true })}\n\n`));
              controller.close();
              return;
            }
            saved = true;
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, response: fullText, saved })}\n\n`));
          controller.close();
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Annotation unavailable', saved: saved ? true : saveAttempted ? null : false, done: true })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: privateEventStreamHeaders(),
    });
  } catch {
    return privateJson({ error: 'Annotation unavailable' }, { status: 503 });
  }
}
