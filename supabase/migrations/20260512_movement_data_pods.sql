-- ============================================================
-- EXPLORER MOVEMENT PHASE 3: SOVEREIGN DATA PODS
-- ============================================================

CREATE TABLE IF NOT EXISTS data_pods (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  version int DEFAULT 1,
  last_commitment_hash text,
  last_committed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_pods_updated_at ON data_pods(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_pods_last_committed_at ON data_pods(last_committed_at DESC);

ALTER TABLE data_pods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'data_pods'
      AND policyname = 'data_pods_service_role_all'
  ) THEN
    CREATE POLICY "data_pods_service_role_all"
      ON data_pods
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'data_pods'
      AND policyname = 'data_pods_member_read'
  ) THEN
    CREATE POLICY "data_pods_member_read"
      ON data_pods
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM members
          WHERE members.id = data_pods.member_id
            AND members.supabase_auth_id = auth.uid()
        )
      );
  END IF;
END $$;
