-- TwiddleTwattle Schema
-- Run in Supabase SQL Editor

-- ═══ TWIDDLES ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS twiddles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT,
  twiddle_type TEXT NOT NULL DEFAULT 'text'
    CHECK (twiddle_type IN ('text', 'voice', 'artifact', 'question', 'sketch')),
  thread_type TEXT NOT NULL DEFAULT 'open'
    CHECK (thread_type IN ('solo', 'open', 'collaborative')),
  voice_url TEXT,
  artifact_url TEXT,
  sketch_data JSONB,
  thinker_tags TEXT[] DEFAULT '{}',
  mintable BOOLEAN DEFAULT true,
  minted BOOLEAN DEFAULT false,
  nft_token_id INTEGER,
  exp_awarded INTEGER DEFAULT 0,
  parent_id UUID REFERENCES twiddles(id) ON DELETE CASCADE,
  root_id UUID REFERENCES twiddles(id) ON DELETE CASCADE,
  is_thinker_response BOOLEAN DEFAULT false,
  thinker_key TEXT,
  is_woven BOOLEAN DEFAULT false,
  woven_from UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ COLLABORATORS ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS twiddle_collaborators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  twiddle_id UUID NOT NULL REFERENCES twiddles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contribution_type TEXT NOT NULL DEFAULT 'branch'
    CHECK (contribution_type IN ('branch', 'remix', 'weave', 'voice')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (twiddle_id, user_id)
);

-- ═══ REACTIONS ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS twiddle_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  twiddle_id UUID NOT NULL REFERENCES twiddles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL
    CHECK (reaction_type IN ('illuminate', 'challenge', 'extend', 'question', 'mint_worthy')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (twiddle_id, user_id, reaction_type)
);

-- ═══ INDEXES ════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_twiddles_author ON twiddles(author_id);
CREATE INDEX IF NOT EXISTS idx_twiddles_root ON twiddles(root_id);
CREATE INDEX IF NOT EXISTS idx_twiddles_parent ON twiddles(parent_id);
CREATE INDEX IF NOT EXISTS idx_twiddles_created ON twiddles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_twiddles_thinker_tags ON twiddles USING GIN(thinker_tags);
CREATE INDEX IF NOT EXISTS idx_twiddle_collab_twiddle ON twiddle_collaborators(twiddle_id);
CREATE INDEX IF NOT EXISTS idx_twiddle_reactions_twiddle ON twiddle_reactions(twiddle_id);

-- ═══ RLS ════════════════════════════════════════════════════
ALTER TABLE twiddles ENABLE ROW LEVEL SECURITY;
ALTER TABLE twiddle_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE twiddle_reactions ENABLE ROW LEVEL SECURITY;

-- Twiddles: readable by all authenticated, insertable/updatable by author
CREATE POLICY "Twiddles readable by authenticated" ON twiddles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Twiddles insertable by author" ON twiddles
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Twiddles updatable by author" ON twiddles
  FOR UPDATE USING (auth.uid() = author_id);

-- Collaborators: readable by authenticated, insertable by participant
CREATE POLICY "Collaborators readable" ON twiddle_collaborators
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Collaborators insertable" ON twiddle_collaborators
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Reactions: readable by authenticated, insertable by reactor
CREATE POLICY "Reactions readable" ON twiddle_reactions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Reactions insertable" ON twiddle_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Reactions deletable by owner" ON twiddle_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- ═══ AUTO-UPDATE TIMESTAMP ═════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER twiddles_updated_at
  BEFORE UPDATE ON twiddles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
