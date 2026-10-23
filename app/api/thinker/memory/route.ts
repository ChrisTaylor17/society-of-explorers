import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { storeConversationEmbedding } from '@/lib/memory/embeddings';

export const runtime = 'nodejs';

type ThinkerMemoryBody = {
  memberId?: unknown;
  thinkerKey?: unknown;
  messages?: unknown;
};

type MemoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimmedText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseMessages(value: unknown): MemoryMessage[] | null {
  if (!Array.isArray(value)) return null;

  const messages: MemoryMessage[] = [];
  for (const item of value.slice(-20)) {
    if (!isRecord(item)) return null;
    const content = trimmedText(item.content);
    if (!content) continue;
    messages.push({
      role: item.role === 'user' ? 'user' : 'assistant',
      content: content.slice(0, 8000),
    });
  }

  return messages.length > 0 ? messages : null;
}

export async function POST(req: NextRequest) {
  let body: ThinkerMemoryBody;

  try {
    body = (await req.json()) as ThinkerMemoryBody;
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const requestedMemberId = trimmedText(body.memberId);
  const thinkerKey = trimmedText(body.thinkerKey);
  const messages = parseMessages(body.messages);

  if (!thinkerKey || !messages) {
    return privateJson({ error: 'thinkerKey and messages required' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  if (requestedMemberId && requestedMemberId !== auth.memberId) {
    return privateJson({ error: 'Cannot store memory for another member' }, { status: 403 });
  }

  try {
    const writes = messages.map((message) =>
      storeConversationEmbedding({
        memberId: auth.memberId,
        thinkerKey,
        role: message.role,
        content: message.content,
        metadata: { source: 'conversation' },
      }),
    );

    await Promise.allSettled(writes);

    return privateJson({ success: true, stored: messages.length });
  } catch {
    return privateJson({ error: 'Failed to store memory' }, { status: 500 });
  }
}
