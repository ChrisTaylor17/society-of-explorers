CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE unrelated_room_reader NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, unrelated_room_reader;

CREATE TABLE public.members (id uuid PRIMARY KEY);
INSERT INTO public.members VALUES
  ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
