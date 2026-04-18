-- ============================================================
-- MEMORY LAYER — WRITE SIDE
-- user_episodes: raw exchange records (answer + reflection pairs)
-- user_semantic_memory: extracted durable facts about members
-- Read-side (match_* RPCs, profile summary) ships in next migration.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS user_episodes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  thinker_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  summary text,
  topic_tags text[] DEFAULT '{}',
  emotional_tone text,
  significance_score float DEFAULT 0.5,
  embedding vector(1536),
  session_id text,
  source text DEFAULT 'practice',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_episodes_member
  ON user_episodes(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_member_thinker
  ON user_episodes(member_id, thinker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_session
  ON user_episodes(session_id);

CREATE TABLE IF NOT EXISTS user_semantic_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  category text NOT NULL CHECK (category IN (
    'identity','goal','challenge','value','preference',
    'relationship','emotional_pattern','milestone','commitment'
  )),
  key text NOT NULL,
  value text NOT NULL,
  confidence float DEFAULT 0.7,
  source_episode_id uuid REFERENCES user_episodes(id) ON DELETE SET NULL,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  version int DEFAULT 1,
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_semantic_member
  ON user_semantic_memory(member_id);
CREATE INDEX IF NOT EXISTS idx_semantic_active
  ON user_semantic_memory(member_id, category)
  WHERE valid_until IS NULL;

ALTER TABLE user_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_semantic_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Server full access episodes" ON user_episodes
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Server full access semantic" ON user_semantic_memory
  FOR ALL USING (true) WITH CHECK (true);
