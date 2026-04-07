import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Generate embedding via OpenAI text-embedding-3-small.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

/**
 * Store a conversation message embedding. Fire and forget.
 */
export async function storeConversationEmbedding({
  memberId,
  thinkerKey,
  role,
  content,
  metadata = {},
}: {
  memberId: string;
  thinkerKey: string;
  role: string;
  content: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const embedding = await generateEmbedding(content);
    await supabaseAdmin.from('thinker_conversation_embeddings').insert({
      member_id: memberId,
      thinker_key: thinkerKey,
      message_role: role,
      content: content.slice(0, 4000),
      embedding,
      metadata,
      conversation_date: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[embeddings] Store failed:', err);
  }
}

/**
 * Retrieve relevant past conversations with the same thinker.
 */
export async function retrieveRelevantMemory({
  memberId,
  thinkerKey,
  query,
  topK = 5,
}: {
  memberId: string;
  thinkerKey: string;
  query: string;
  topK?: number;
}): Promise<Array<{ content: string; thinker_key: string; conversation_date: string; similarity: number }>> {
  try {
    const embedding = await generateEmbedding(query);

    const { data, error } = await supabaseAdmin.rpc('match_thinker_embeddings', {
      query_embedding: embedding,
      match_member_id: memberId,
      match_thinker_key: thinkerKey,
      match_count: topK,
    });

    if (error) {
      console.error('[embeddings] Retrieve error:', error);
      return [];
    }

    return (data || []).map((r: any) => ({
      content: r.content,
      thinker_key: r.thinker_key,
      conversation_date: r.conversation_date,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error('[embeddings] Retrieve failed:', err);
    return [];
  }
}

/**
 * Retrieve relevant conversations from OTHER thinkers (cross-thinker memory).
 */
export async function retrieveCrossThinkerMemory({
  memberId,
  currentThinkerKey,
  query,
  topK = 3,
}: {
  memberId: string;
  currentThinkerKey: string;
  query: string;
  topK?: number;
}): Promise<Array<{ content: string; thinker_key: string; conversation_date: string; similarity: number }>> {
  try {
    const embedding = await generateEmbedding(query);

    const { data, error } = await supabaseAdmin.rpc('match_cross_thinker_embeddings', {
      query_embedding: embedding,
      match_member_id: memberId,
      exclude_thinker_key: currentThinkerKey,
      match_count: topK,
    });

    if (error) {
      console.error('[embeddings] Cross-thinker error:', error);
      return [];
    }

    return (data || []).map((r: any) => ({
      content: r.content,
      thinker_key: r.thinker_key,
      conversation_date: r.conversation_date,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error('[embeddings] Cross-thinker failed:', err);
    return [];
  }
}
