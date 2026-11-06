-- Three room tables reproduce the reviewed column, FK, and grant shapes.
-- Community/member prerequisites and all rows/default expressions are synthetic.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE unrelated_room_reader NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, unrelated_room_reader;

CREATE TABLE public.members (id uuid PRIMARY KEY);
CREATE TABLE public.communities (id uuid PRIMARY KEY, slug text NOT NULL UNIQUE);
GRANT SELECT ON public.communities TO service_role;
CREATE TABLE public.video_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.members(id),
  room_name text NOT NULL UNIQUE,
  daily_room_url text,
  title text NOT NULL DEFAULT 'Synthetic room',
  room_type text DEFAULT 'open',
  project_id uuid,
  council_session_id text,
  active_thinkers text[] DEFAULT '{}',
  is_live boolean DEFAULT false,
  max_participants integer DEFAULT 8,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  scheduled_for timestamptz,
  metadata jsonb DEFAULT '{}'
);
CREATE TABLE public.room_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.video_rooms(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  left_at timestamptz,
  UNIQUE (room_id, member_id)
);
CREATE TABLE public.room_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.video_rooms(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id),
  speaker_name text,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
GRANT ALL ON public.room_participants, public.room_transcripts, public.video_rooms TO anon, authenticated, service_role;
CREATE TABLE public.unrelated_room_catalog (label text);
INSERT INTO public.unrelated_room_catalog VALUES ('Synthetic public item');
GRANT SELECT ON public.unrelated_room_catalog TO anon;

INSERT INTO public.members VALUES
  ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
INSERT INTO public.communities VALUES
  ('20000000-0000-4000-8000-000000000001', 'society-of-explorers'),
  ('20000000-0000-4000-8000-000000000002', 'different-community');
INSERT INTO public.video_rooms (id, community_id, created_by, room_name, daily_room_url, title,
    room_type, is_live, scheduled_for, ended_at, metadata)
VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'live-fixture', 'https://soe-fixture.daily.co/live-fixture',
   'Synthetic Live Council', 'live_session', true, now() - interval '10 minutes', null, '{"summary":{"title":"PRIVATE_SUMMARY_FIXTURE"}}'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'past-fixture', 'https://soe-fixture.daily.co/past-fixture',
   'Previous Live Council', 'live_session', false, now() - interval '1 day', now() - interval '1 day', '{"summary":{"title":"PRIVATE_PAST_SUMMARY_FIXTURE"}}'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'old-open', 'https://soe-fixture.daily.co/old-open',
   'Synthetic legacy room', null, true, null, null, '{"summary":"PRIVATE_LEGACY_METADATA_FIXTURE"}'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000002', 'foreign-room', 'https://soe-fixture.daily.co/foreign-room',
   'Other community room', 'live_session', true, now() - interval '20 minutes', null, '{}'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'future-room', 'https://soe-fixture.daily.co/future-room',
   'Next Live Council', 'live_session', false, now() + interval '1 day', null, '{}');
INSERT INTO public.room_participants (room_id, member_id, joined_at)
  VALUES ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', now() - interval '1 day');
INSERT INTO public.room_transcripts (room_id, member_id, speaker_name, content)
  VALUES ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    'Synthetic speaker', 'PRIVATE_TRANSCRIPT_FIXTURE');
