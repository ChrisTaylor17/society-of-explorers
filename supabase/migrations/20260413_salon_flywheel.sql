-- ============================================================
-- SALON GUIDE FLYWHEEL — DATABASE FOUNDATION
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS salons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
  guide_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  cohort_number int DEFAULT 1,
  week_number int DEFAULT 1 CHECK (week_number BETWEEN 1 AND 7),
  status text DEFAULT 'recruiting' CHECK (status IN ('recruiting', 'active', 'graduating', 'completed')),
  max_members int DEFAULT 7,
  topic_rotation jsonb DEFAULT '["singularity", "blockchain", "consciousness"]',
  treasury_wallet_id uuid,
  parent_salon_id uuid REFERENCES salons(id) ON DELETE SET NULL,
  started_at timestamptz,
  graduates_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salon_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE NOT NULL,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  role text DEFAULT 'member' CHECK (role IN ('member', 'guide', 'graduating')),
  joined_at timestamptz DEFAULT now(),
  graduated_at timestamptz,
  sessions_led int DEFAULT 0,
  sessions_attended int DEFAULT 0,
  absences_unexcused int DEFAULT 0,
  is_guide_candidate boolean DEFAULT false,
  UNIQUE(salon_id, member_id)
);

CREATE TABLE IF NOT EXISTS salon_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE NOT NULL,
  led_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  session_date date NOT NULL,
  session_number int,
  topic text,
  track text CHECK (track IN ('singularity', 'blockchain', 'consciousness')),
  attendance jsonb DEFAULT '[]',
  thinker_used text,
  transcript_summary text,
  exp_awarded_total int DEFAULT 0,
  video_room_id uuid,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE members ADD COLUMN IF NOT EXISTS is_guide boolean DEFAULT false;
ALTER TABLE members ADD COLUMN IF NOT EXISTS guide_since timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS guide_level int DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS salons_led int DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS members_graduated int DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS guide_earnings_total int DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_salons_community ON salons(community_id);
CREATE INDEX IF NOT EXISTS idx_salons_guide ON salons(guide_member_id);
CREATE INDEX IF NOT EXISTS idx_salons_status ON salons(status);
CREATE INDEX IF NOT EXISTS idx_salons_parent ON salons(parent_salon_id);
CREATE INDEX IF NOT EXISTS idx_salon_members_salon ON salon_members(salon_id);
CREATE INDEX IF NOT EXISTS idx_salon_members_member ON salon_members(member_id);
CREATE INDEX IF NOT EXISTS idx_salon_sessions_salon ON salon_sessions(salon_id);
CREATE INDEX IF NOT EXISTS idx_salon_sessions_date ON salon_sessions(session_date);

ALTER TABLE salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Server full access salons" ON salons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Server full access salon_members" ON salon_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Server full access salon_sessions" ON salon_sessions FOR ALL USING (true) WITH CHECK (true);

-- video_rooms migration (SOE-1)
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
