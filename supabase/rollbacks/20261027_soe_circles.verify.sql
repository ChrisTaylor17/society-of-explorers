-- Read-only. Run AFTER 20261027_soe_circles.sql.
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'book_cohorts' AND column_name LIKE 'circle_%' ORDER BY 1;  -- expect 10
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('circle_private', 'circle_rsvps', 'circle_reports');                                   -- expect 3 rows, all true
SELECT tablename, policyname FROM pg_policies WHERE tablename LIKE 'circle_%';                            -- expect 0 rows
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_name LIKE 'circle_%' AND grantee IN ('anon', 'authenticated');                                -- expect 0 rows
