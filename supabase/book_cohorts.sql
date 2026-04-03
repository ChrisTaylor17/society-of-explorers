-- Book Salons / Cohorts — run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS book_cohorts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  max_members INT DEFAULT 8,
  start_date TIMESTAMPTZ,
  thinker_id TEXT DEFAULT 'socrates',
  status TEXT DEFAULT 'forming', -- forming | active | completed
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS book_cohort_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES book_cohorts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cohort_id, member_id)
);

CREATE TABLE IF NOT EXISTS seminar_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES book_cohorts(id) ON DELETE CASCADE,
  member_id UUID,
  member_name TEXT DEFAULT 'Explorer',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cohort_members ON book_cohort_members(cohort_id);
CREATE INDEX IF NOT EXISTS idx_seminar_messages ON seminar_messages(cohort_id, created_at);

ALTER TABLE book_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_cohort_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE seminar_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cohorts public read" ON book_cohorts FOR SELECT USING (true);
CREATE POLICY "Cohorts insert" ON book_cohorts FOR INSERT WITH CHECK (true);
CREATE POLICY "Cohort members open" ON book_cohort_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Seminar messages open" ON seminar_messages FOR ALL USING (true) WITH CHECK (true);
