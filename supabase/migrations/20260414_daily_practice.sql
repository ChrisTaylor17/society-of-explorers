-- ============================================================
-- DAILY PRACTICE + MATCHED CONVERSATIONS
-- Run in Supabase SQL Editor
-- ============================================================

-- Daily questions (one per day, thinker-generated)
CREATE TABLE IF NOT EXISTS daily_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  thinker_id text NOT NULL,
  question_text text NOT NULL,
  question_context text,
  date date NOT NULL UNIQUE,
  engagement_score float DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_questions_date ON daily_questions(date DESC);

-- Question responses (one per member per question)
CREATE TABLE IF NOT EXISTS question_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  question_id uuid REFERENCES daily_questions(id) ON DELETE CASCADE NOT NULL,
  response_text text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(member_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_responses_question ON question_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_responses_member ON question_responses(member_id);

-- Streak tracking on members
ALTER TABLE members ADD COLUMN IF NOT EXISTS current_streak int DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS longest_streak int DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_practice_date date;
ALTER TABLE members ADD COLUMN IF NOT EXISTS total_responses int DEFAULT 0;

-- Matched conversations
CREATE TABLE IF NOT EXISTS matched_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  member_a uuid REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  member_b uuid REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  thinker_id text NOT NULL,
  match_reason text,
  prompts jsonb DEFAULT '[]',
  scheduled_for timestamptz,
  status text DEFAULT 'pending',
  rating_a int,
  rating_b int,
  feedback_a text,
  feedback_b text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_matched_member_a ON matched_conversations(member_a);
CREATE INDEX IF NOT EXISTS idx_matched_member_b ON matched_conversations(member_b);
CREATE INDEX IF NOT EXISTS idx_matched_status ON matched_conversations(status);

-- RLS
ALTER TABLE daily_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE matched_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Server full access daily_questions" ON daily_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Server full access question_responses" ON question_responses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Server full access matched_conversations" ON matched_conversations FOR ALL USING (true) WITH CHECK (true);
