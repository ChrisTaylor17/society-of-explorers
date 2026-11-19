import { NextRequest } from 'next/server';
import { createAnthropicClient, logClaudeUsage, resolveClaudeModel } from '@/lib/ai/anthropic';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { internalRouteError, privateJson } from '@/lib/http/routeError';
import { systemPromptFor, type Manifest } from '@/lib/movement/personalAI';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const THRESHOLD = 30;

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface PersonalAiProfileRow {
  manifest: Manifest;
  response_count_at_build: number;
}

function isChatRole(value: unknown): value is ChatRole {
  return value === 'user' || value === 'assistant';
}

function cleanHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      role: isChatRole(item.role) ? item.role : null,
      content: typeof item.content === 'string' ? item.content.trim() : '',
    }))
    .filter((item): item is ChatMessage => Boolean(item.role) && Boolean(item.content))
    .slice(-12);
}

function isManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ['tone', 'themes', 'leanings', 'blind_spots', 'opening_line'].every(
    (field) => typeof record[field] === 'string' && Boolean((record[field] as string).trim()),
  );
}

async function countPracticeResponses(memberId: string): Promise<number> {
  const supabaseAdmin = getSupabaseAdmin();
  const { count, error } = await supabaseAdmin
    .from('question_responses')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId);

  if (error) throw new Error('practice-response-count-failed');
  return count ?? 0;
}

function notReady(responseCount: number) {
  const remaining = Math.max(0, THRESHOLD - responseCount);
  return privateJson({
    ready: false,
    responseCount,
    threshold: THRESHOLD,
    message: `Keep practicing. Your mirror needs ${remaining} more responses before it can reflect you.`,
  });
}

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(req);
    if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return privateJson({ error: 'message required' }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('personal_ai_profiles')
      .select('manifest, response_count_at_build')
      .eq('member_id', auth.memberId)
      .maybeSingle();

    if (error) throw new Error('personal-ai-profile-lookup-failed');

    const profile = data as PersonalAiProfileRow | null;
    const currentResponseCount = await countPracticeResponses(auth.memberId);
    const responseCount = Math.max(currentResponseCount, profile?.response_count_at_build ?? 0);

    if (!profile || profile.response_count_at_build < THRESHOLD || !isManifest(profile.manifest)) {
      return notReady(responseCount);
    }

    const encoder = new TextEncoder();
    const history = cleanHistory(body.history);
    const anthropic = createAnthropicClient();
    const claudeModel = resolveClaudeModel('personal-ai');
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const startedAt = Date.now();
          const anthropicStream = anthropic.messages.stream({
            model: claudeModel,
            max_tokens: 700,
            system: systemPromptFor(profile.manifest),
            messages: [...history, { role: 'user', content: message }],
          });

          anthropicStream.on('text', (text) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
          });

          const finalMessage = await anthropicStream.finalMessage();
          logClaudeUsage({
            purpose: 'personal-ai',
            model: claudeModel,
            operation: 'messages.stream',
            latencyMs: Date.now() - startedAt,
            usage: finalMessage.usage,
          });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        } catch {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: 'Mirror stream failed',
              })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return internalRouteError('Personal AI chat failed');
  }
}
