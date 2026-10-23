import { getSupabaseAdmin } from '@/lib/supabase/admin';

type RetrievedEmbeddingRow = {
  content: string;
  thinker_key: string;
  conversation_date: string;
  similarity: number;
};

function reportEmbeddingFailure(scope: string) {
  console.warn(`[embeddings] ${scope} failed`);
}

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
    throw new Error('Embedding API request failed');
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
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
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
  } catch {
    reportEmbeddingFailure('store');
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
    const supabaseAdmin = getSupabaseAdmin();
    const embedding = await generateEmbedding(query);

    const { data, error } = await supabaseAdmin.rpc('match_thinker_embeddings', {
      query_embedding: embedding,
      match_member_id: memberId,
      match_thinker_key: thinkerKey,
      match_count: topK,
    });

    if (error) {
      reportEmbeddingFailure('retrieve');
      return [];
    }

    return ((data || []) as RetrievedEmbeddingRow[]).map((r) => ({
      content: r.content,
      thinker_key: r.thinker_key,
      conversation_date: r.conversation_date,
      similarity: r.similarity,
    }));
  } catch {
    reportEmbeddingFailure('retrieve');
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
    const supabaseAdmin = getSupabaseAdmin();
    const embedding = await generateEmbedding(query);

    const { data, error } = await supabaseAdmin.rpc('match_cross_thinker_embeddings', {
      query_embedding: embedding,
      match_member_id: memberId,
      exclude_thinker_key: currentThinkerKey,
      match_count: topK,
    });

    if (error) {
      reportEmbeddingFailure('cross-thinker');
      return [];
    }

    return ((data || []) as RetrievedEmbeddingRow[]).map((r) => ({
      content: r.content,
      thinker_key: r.thinker_key,
      conversation_date: r.conversation_date,
      similarity: r.similarity,
    }));
  } catch {
    reportEmbeddingFailure('cross-thinker');
    return [];
  }
}
