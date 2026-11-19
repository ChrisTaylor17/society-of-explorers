-- Read-only. Run BEFORE 20261027_soe_circles.sql. STOP if any circle_* table or column already exists
-- with a different shape than the migration expects.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'book_cohorts' ORDER BY ordinal_position;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('circle_private', 'circle_rsvps', 'circle_reports');
SELECT count(*) AS cohorts FROM book_cohorts;
