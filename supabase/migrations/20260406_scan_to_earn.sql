-- Scan-to-Earn Schema for Explorer Commons World Layer
-- Run in Supabase SQL Editor
-- After running, create a Storage bucket called 'world-scans' (public)

-- ═══ SPACES ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS spaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  host_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  space_type TEXT NOT NULL DEFAULT 'salon'
    CHECK (space_type IN ('salon', 'library', 'temple', 'garden', 'waypoint', 'outpost')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'pending')),
  cover_url TEXT,
  total_scans INTEGER DEFAULT 0,
  avg_quality DOUBLE PRECISION DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ SCAN UPLOADS ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scan_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  scanner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  proof_hash TEXT NOT NULL,
  scan_type TEXT NOT NULL DEFAULT 'photo'
    CHECK (scan_type IN ('photo', 'lidar', 'photogrammetry', 'video', 'audio')),
  quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
  verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  exp_awarded INTEGER DEFAULT 0,
  is_first_scan BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ SPATIAL ANNOTATIONS ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS spatial_annotations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES scan_uploads(id) ON DELETE SET NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  annotation_type TEXT NOT NULL DEFAULT 'note'
    CHECK (annotation_type IN ('note', 'insight', 'question', 'story', 'warning', 'ritual')),
  position_x DOUBLE PRECISION,
  position_y DOUBLE PRECISION,
  position_z DOUBLE PRECISION,
  exp_awarded INTEGER DEFAULT 3,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ SCAN QUALITY LOG ═════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scan_quality_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES scan_uploads(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  quality_score INTEGER NOT NULL CHECK (quality_score >= 0 AND quality_score <= 100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ INDEXES ══════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_spaces_slug ON spaces(slug);
CREATE INDEX IF NOT EXISTS idx_spaces_host ON spaces(host_id);
CREATE INDEX IF NOT EXISTS idx_spaces_city ON spaces(city);
CREATE INDEX IF NOT EXISTS idx_spaces_status ON spaces(status);
CREATE INDEX IF NOT EXISTS idx_scans_space ON scan_uploads(space_id);
CREATE INDEX IF NOT EXISTS idx_scans_scanner ON scan_uploads(scanner_id);
CREATE INDEX IF NOT EXISTS idx_scans_created ON scan_uploads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_annotations_space ON spatial_annotations(space_id);
CREATE INDEX IF NOT EXISTS idx_annotations_scan ON spatial_annotations(scan_id);
CREATE INDEX IF NOT EXISTS idx_quality_log_scan ON scan_quality_log(scan_id);

-- ═══ RLS ══════════════════════════════════════════════════════
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE spatial_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_quality_log ENABLE ROW LEVEL SECURITY;

-- Spaces: readable by all authenticated, insertable/updatable by host
CREATE POLICY "Spaces readable by authenticated" ON spaces
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Spaces insertable by authenticated" ON spaces
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Spaces updatable by host" ON spaces
  FOR UPDATE USING (auth.uid() = host_id);

CREATE POLICY "Spaces deletable by host" ON spaces
  FOR DELETE USING (auth.uid() = host_id);

-- Scans: readable by authenticated, insertable by scanner
CREATE POLICY "Scans readable by authenticated" ON scan_uploads
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Scans insertable by scanner" ON scan_uploads
  FOR INSERT WITH CHECK (auth.uid() = scanner_id);

CREATE POLICY "Scans updatable by space host" ON scan_uploads
  FOR UPDATE USING (
    auth.uid() IN (SELECT host_id FROM spaces WHERE id = space_id)
  );

-- Annotations: readable by authenticated, insertable by author
CREATE POLICY "Annotations readable by authenticated" ON spatial_annotations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Annotations insertable by author" ON spatial_annotations
  FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Quality log: readable by authenticated, insertable by reviewer
CREATE POLICY "Quality log readable by authenticated" ON scan_quality_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Quality log insertable by reviewer" ON scan_quality_log
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- ═══ AUTO-UPDATE TIMESTAMP ════════════════════════════════════
CREATE TRIGGER spaces_updated_at
  BEFORE UPDATE ON spaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══ SEED: 92B SOUTH ST ══════════════════════════════════════
INSERT INTO spaces (name, slug, description, address, city, country, lat, lng, space_type, status)
VALUES (
  '92B South Street Salon',
  '92b-south-st',
  'The founding salon of the Society of Explorers. A permanent philosophical home in downtown Boston where ideas stop being abstract and become real.',
  '92B South St',
  'Boston',
  'United States',
  42.3527,
  -71.0544,
  'salon',
  'active'
) ON CONFLICT (slug) DO NOTHING;
