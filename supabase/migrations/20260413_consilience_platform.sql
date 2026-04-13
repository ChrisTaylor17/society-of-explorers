-- ============================================================
-- CONSILIENCE PLATFORM — Community matching + questionnaires + contracts
-- Run in Supabase SQL Editor
-- ============================================================

-- Extend communities table (columns may already exist — IF NOT EXISTS handles this)
ALTER TABLE communities ADD COLUMN IF NOT EXISTS philosophy_orientation text DEFAULT 'eclectic';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS governance_type text DEFAULT 'dao';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS treasury_address text;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS voting_threshold numeric DEFAULT 0.51;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS membership_token text;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS is_template boolean DEFAULT false;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS template_source text;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS mission text;

-- Community questionnaire
CREATE TABLE IF NOT EXISTS community_questionnaire (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
  questions jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  UNIQUE(community_id)
);

-- Member match profiles (questionnaire answers + philosophical vector)
CREATE TABLE IF NOT EXISTS community_match_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}',
  philosophical_vector jsonb DEFAULT '{}',
  matched_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(community_id, member_id)
);

-- Member-to-member matches
CREATE TABLE IF NOT EXISTS community_matches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
  member_a uuid REFERENCES members(id) ON DELETE CASCADE,
  member_b uuid REFERENCES members(id) ON DELETE CASCADE,
  compatibility_score numeric DEFAULT 0,
  tension_axes jsonb DEFAULT '[]',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'active')),
  chat_started boolean DEFAULT false,
  video_started boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Community contracts (for future Solana deployment)
CREATE TABLE IF NOT EXISTS community_contracts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
  contract_type text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}',
  solana_address text,
  deployment_status text DEFAULT 'draft' CHECK (deployment_status IN ('draft', 'deploying', 'deployed', 'failed')),
  deployed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cmp_community ON community_match_profiles(community_id);
CREATE INDEX IF NOT EXISTS idx_cmp_member ON community_match_profiles(member_id);
CREATE INDEX IF NOT EXISTS idx_cm_community ON community_matches(community_id);
CREATE INDEX IF NOT EXISTS idx_cm_members ON community_matches(member_a, member_b);
CREATE INDEX IF NOT EXISTS idx_cc_community ON community_contracts(community_id);

-- RLS
ALTER TABLE community_questionnaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_match_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Server full access cq" ON community_questionnaire FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Server full access cmp" ON community_match_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Server full access cm" ON community_matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Server full access cc" ON community_contracts FOR ALL USING (true) WITH CHECK (true);
