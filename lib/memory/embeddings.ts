import { getSupabaseAdmin } from '@/lib/supabase/admin';

type RetrievedEmbeddingRow = {
  content: string;
  thinker_key: string;
  conversation_date: string;
  similarity: number;
};

export type ConversationEmbeddingWriteResult = { status: 'stored' | 'unconfirmed' };

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportEmbeddingFailure(scope: string) {
  console.warn(`[embeddings] ${scope} failed`);
}

/**
 * Generate embedding via OpenAI text-embedding-3-small.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('Embedding provider is not configured');

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    }),
  });

  if (!res.ok) {
    throw new Error('Embedding API request failed');
  }

  const data: unknown = await res.json();
  const item = isRecord(data) && Array.isArray(data.data) && data.data.length === 1 ? data.data[0] : null;
  if (!isRecord(data) || data.object !== 'list' || data.model !== EMBEDDING_MODEL ||
      !isRecord(item) || item.object !== 'embedding' || item.index !== 0 ||
      !Array.isArray(item.embedding) || item.embedding.length !== EMBEDDING_DIMENSIONS ||
      !item.embedding.every(value => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('Invalid embedding provider response');
  }
  return item.embedding;
}

/**
 * Confirm the inserted row when possible. Unconfirmed does not prove absence:
 * an acknowledgement can be lost after the database commits the write.
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
}): Promise<ConversationEmbeddingWriteResult> {
  try {
    const embedding = await generateEmbedding(content);
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error, status } = await supabaseAdmin.from('thinker_conversation_embeddings').insert({
      member_id: memberId,
      thinker_key: thinkerKey,
      message_role: role,
      content: content.slice(0, 4000),
      embedding,
      metadata,
      conversation_date: new Date().toISOString(),
    }).select('member_id,thinker_key,message_role').single();
    if (error !== null || status < 200 || status >= 300 || !isRecord(data) ||
        data.member_id !== memberId || data.thinker_key !== thinkerKey || data.message_role !== role) {
      throw new Error('Memory save was not confirmed');
    }
    return { status: 'stored' };
  } catch {
    reportEmbeddingFailure('store');
    return { status: 'unconfirmed' };
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
