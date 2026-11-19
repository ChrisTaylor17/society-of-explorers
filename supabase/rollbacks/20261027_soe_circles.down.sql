-- DESTRUCTIVE. Only if the circles migration must be undone. Deletes all circle RSVPs, reports and
-- private links, and the circle_* columns. Circle cohorts themselves remain as rows in book_cohorts
-- (book_id = 'soe-circles-path'); delete them separately if wanted. Take a backup first.
DROP TABLE IF EXISTS circle_reports;
DROP TABLE IF EXISTS circle_rsvps;
DROP TABLE IF EXISTS circle_private;
DROP INDEX IF EXISTS idx_book_cohorts_circle;
ALTER TABLE book_cohorts
  DROP COLUMN IF EXISTS circle_format, DROP COLUMN IF EXISTS circle_city, DROP COLUMN IF EXISTS circle_region,
  DROP COLUMN IF EXISTS circle_venue_name, DROP COLUMN IF EXISTS circle_venue_type, DROP COLUMN IF EXISTS circle_weekday,
  DROP COLUMN IF EXISTS circle_time, DROP COLUMN IF EXISTS circle_timezone, DROP COLUMN IF EXISTS circle_path_id,
  DROP COLUMN IF EXISTS circle_hidden;
