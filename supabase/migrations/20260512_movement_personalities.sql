CREATE TABLE IF NOT EXISTS personality_outputs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  personality_slug text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('script','lyric','dialogue','commentary')),
  topic text,
  content text NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at timestamptz DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_personality_outputs_slug ON personality_outputs(personality_slug);
CREATE INDEX IF NOT EXISTS idx_personality_outputs_kind ON personality_outputs(kind);
CREATE INDEX IF NOT EXISTS idx_personality_outputs_created ON personality_outputs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personality_outputs_status ON personality_outputs(status);

ALTER TABLE personality_outputs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='personality_outputs' 
    AND policyname='personality_outputs_service_role_all'
  ) THEN
    CREATE POLICY "personality_outputs_service_role_all"
      ON personality_outputs FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='personality_outputs' 
    AND policyname='personality_outputs_public_published_read'
  ) THEN
    CREATE POLICY "personality_outputs_public_published_read"
      ON personality_outputs FOR SELECT TO anon, authenticated
      USING (status = 'published');
  END IF;
END $$;
