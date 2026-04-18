-- ============================================================
-- PRACTICE REFLECTIONS
-- Each daily answer gets a streaming reflection from the
-- thinker who authored that day's question.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS practice_reflections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  response_id uuid UNIQUE NOT NULL
    REFERENCES question_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL
    REFERENCES daily_questions(id) ON DELETE CASCADE,
  thinker_id text NOT NULL,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  reflection_text text NOT NULL,
  is_public boolean DEFAULT true,
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reflections_member_thinker
  ON practice_reflections(member_id, thinker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflections_question
  ON practice_reflections(question_id);
CREATE INDEX IF NOT EXISTS idx_reflections_public_recent
  ON practice_reflections(created_at DESC) WHERE is_public = true;

ALTER TABLE practice_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Server full access reflections"
  ON practice_reflections FOR ALL USING (true) WITH CHECK (true);
