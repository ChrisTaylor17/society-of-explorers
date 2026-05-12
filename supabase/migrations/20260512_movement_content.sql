-- ============================================================
-- EXPLORER MOVEMENT PHASE 2: CONTENT ENGINE + UTM TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS movement_scripts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid REFERENCES daily_questions(id) ON DELETE CASCADE,
  platform text CHECK (platform IN ('tiktok','reels','shorts')) NOT NULL,
  hook text NOT NULL,
  script text NOT NULL,
  visual_treatment text,
  cta text,
  duration_seconds int,
  status text DEFAULT 'draft' CHECK (status IN ('draft','approved','published','archived')),
  performance jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_movement_scripts_question_id ON movement_scripts(question_id);
CREATE INDEX IF NOT EXISTS idx_movement_scripts_status ON movement_scripts(status);
CREATE INDEX IF NOT EXISTS idx_movement_scripts_created_at ON movement_scripts(created_at DESC);

CREATE TABLE IF NOT EXISTS utm_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id uuid REFERENCES movement_scripts(id) ON DELETE CASCADE,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  short_code text UNIQUE NOT NULL,
  clicks int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_utm_links_script_id ON utm_links(script_id);
CREATE INDEX IF NOT EXISTS idx_utm_links_short_code ON utm_links(short_code);

ALTER TABLE movement_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE utm_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'movement_scripts'
      AND policyname = 'movement_scripts_service_role_all'
  ) THEN
    CREATE POLICY "movement_scripts_service_role_all"
      ON movement_scripts
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'movement_scripts'
      AND policyname = 'movement_scripts_public_published_read'
  ) THEN
    CREATE POLICY "movement_scripts_public_published_read"
      ON movement_scripts
      FOR SELECT
      TO anon, authenticated
      USING (status = 'published');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'utm_links'
      AND policyname = 'utm_links_service_role_all'
  ) THEN
    CREATE POLICY "utm_links_service_role_all"
      ON utm_links
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'utm_links'
      AND policyname = 'utm_links_public_published_script_read'
  ) THEN
    CREATE POLICY "utm_links_public_published_script_read"
      ON utm_links
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM movement_scripts
          WHERE movement_scripts.id = utm_links.script_id
            AND movement_scripts.status = 'published'
        )
      );
  END IF;
END $$;
