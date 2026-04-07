import { NextRequest, NextResponse } from 'next/server';
import { storeConversationEmbedding } from '@/lib/memory/embeddings';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { memberId, thinkerKey, messages } = await req.json();

    if (!memberId || !thinkerKey || !messages?.length) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Store embeddings for each message (fire and forget per message)
    const promises = messages.map((msg: { role: string; content: string }) =>
      storeConversationEmbedding({
        memberId,
        thinkerKey,
        role: msg.role,
        content: msg.content,
        metadata: { source: 'conversation' },
      })
    );

    await Promise.allSettled(promises);

    return NextResponse.json({ success: true, stored: messages.length });
  } catch (err) {
    console.error('[thinker/memory] Error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
