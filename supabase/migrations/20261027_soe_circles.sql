-- SoE Circles MVP (2026-10-27). ADDITIVE ONLY.
-- * Adds nullable circle_* columns to book_cohorts (existing rows are untouched; circle_hidden defaults to false).
-- * Creates three new tables: circle_private, circle_rsvps, circle_reports.
-- * No drops, no renames, no type changes, no policy changes on existing tables.
-- New tables have RLS on with NO policies and no anon/authenticated grants, so only the
-- service role (server routes) can read or write them. book_cohorts keeps its existing
-- public-read policy, so nothing private is stored on it (the video link lives in circle_private).
-- Run in the Supabase SQL editor. Preflight: supabase/rollbacks/20261027_soe_circles.preflight.sql
-- Verify after:  supabase/rollbacks/20261027_soe_circles.verify.sql

ALTER TABLE book_cohorts ADD COLUMN IF NOT EXISTS circle_format TEXT;        -- in_person | online | hybrid
ALTER TABLE book_cohorts ADD COLUMN IF NOT EXISTS circle_city TEXT;
ALTER TABLE book_cohorts ADD COLUMN IF NOT EXISTS circle_region TEXT;
ALTER TABLE book_cohorts ADD COLUMN IF NOT EXISTS circle_venue_name TEXT;    -- public venue only, never a home
ALTER TABLE book_cohorts ADD COLUMN IF NOT EXISTS circle_venue_type TEXT;
ALTER TABLE book_cohorts ADD COLUMN IF NOT EXISTS circle_weekday SMALLINT;   -- 0 = Sunday
ALTER TABLE book_cohorts ADD COLUMN IF NOT EXISTS circle_time TEXT;          -- HH:MM, 24h, in circle_timezone
ALTER TABLE book_cohorts ADD COLUMN IF NOT EXISTS circle_timezone TEXT;
ALTER TABLE book_cohorts ADD COLUMN IF NOT EXISTS circle_path_id TEXT;
ALTER TABLE book_cohorts ADD COLUMN IF NOT EXISTS circle_hidden BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_book_cohorts_circle ON book_cohorts(book_id, circle_hidden, circle_city);

-- Members-only details (online meeting link).
CREATE TABLE IF NOT EXISTS circle_private (
  cohort_id UUID PRIMARY KEY REFERENCES book_cohorts(id) ON DELETE CASCADE,
  online_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS circle_rsvps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES book_cohorts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  meeting_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'going',     -- going | not_going
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cohort_id, member_id, meeting_date)
);
CREATE INDEX IF NOT EXISTS idx_circle_rsvps_meeting ON circle_rsvps(cohort_id, meeting_date);

CREATE TABLE IF NOT EXISTS circle_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_id UUID NOT NULL REFERENCES book_cohorts(id) ON DELETE CASCADE,
  reporter_member_id UUID,                  -- null when reported while signed out
  reporter_key TEXT,                        -- hashed IP for signed-out reports (dedupe only)
  reason TEXT NOT NULL,                     -- safety | harassment | spam | misleading | inappropriate | other
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',      -- open | reviewed | dismissed
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_circle_reports_open ON circle_reports(cohort_id, status);

ALTER TABLE circle_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON circle_private FROM anon, authenticated;
REVOKE ALL ON circle_rsvps FROM anon, authenticated;
REVOKE ALL ON circle_reports FROM anon, authenticated;
