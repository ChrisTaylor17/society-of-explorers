-- ============================================================
-- EXPLORER MOVEMENT PHASE 4: PERSONAL AI MIRROR
-- ============================================================

CREATE TABLE IF NOT EXISTS personal_ai_profiles (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  manifest jsonb NOT NULL,
  response_count_at_build int NOT NULL DEFAULT 0,
  last_built_at timestamptz DEFAULT now(),
  version int DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_personal_ai_last_built_at
  ON personal_ai_profiles(last_built_at DESC);

CREATE INDEX IF NOT EXISTS idx_personal_ai_response_count
  ON personal_ai_profiles(response_count_at_build DESC);

ALTER TABLE personal_ai_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personal_ai_profiles'
      AND policyname = 'personal_ai_profiles_service_role_all'
  ) THEN
    CREATE POLICY "personal_ai_profiles_service_role_all"
      ON personal_ai_profiles
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personal_ai_profiles'
      AND policyname = 'personal_ai_profiles_member_read'
  ) THEN
    CREATE POLICY "personal_ai_profiles_member_read"
      ON personal_ai_profiles
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM members
          WHERE members.id = personal_ai_profiles.member_id
            AND members.supabase_auth_id = auth.uid()
        )
      );
  END IF;
END $$;
