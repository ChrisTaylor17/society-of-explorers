-- Great Books schema — run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS great_books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  year TEXT,
  gutenberg_id TEXT,
  recommended_thinker TEXT,
  description TEXT,
  total_sections INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS great_books_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES great_books(id) ON DELETE CASCADE,
  section_number INT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  word_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id, section_number)
);

CREATE TABLE IF NOT EXISTS book_highlights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID,
  book_id TEXT NOT NULL,
  section_number INT,
  passage TEXT NOT NULL,
  thinker_id TEXT,
  annotation TEXT,
  question TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reading_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL,
  book_id TEXT NOT NULL,
  section_id TEXT,
  paragraph_index INT DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_sections_book ON great_books_sections(book_id, section_number);
CREATE INDEX IF NOT EXISTS idx_highlights_member ON book_highlights(member_id, book_id);
CREATE INDEX IF NOT EXISTS idx_progress_member ON reading_progress(member_id);

ALTER TABLE great_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE great_books_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Books are public" ON great_books FOR SELECT USING (true);
CREATE POLICY "Sections are public" ON great_books_sections FOR SELECT USING (true);
CREATE POLICY "Highlights open" ON book_highlights FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Progress open" ON reading_progress FOR ALL USING (true) WITH CHECK (true);
