-- Synthetic rows on the observed six-column table and policy shape.
CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  sender_id uuid REFERENCES public.members(id),
  recipient_id uuid REFERENCES public.members(id),
  content text NOT NULL,
  read boolean DEFAULT false
);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Can read own messages" ON public.direct_messages FOR SELECT TO PUBLIC USING (
  sender_id IN (SELECT members.id FROM public.members WHERE members.supabase_auth_id = auth.uid())
  OR recipient_id IN (SELECT members.id FROM public.members WHERE members.supabase_auth_id = auth.uid())
);
CREATE POLICY "Can send messages" ON public.direct_messages FOR INSERT TO PUBLIC WITH CHECK (
  sender_id IN (SELECT members.id FROM public.members WHERE members.supabase_auth_id = auth.uid())
);
CREATE POLICY dm_open ON public.direct_messages FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.direct_messages TO anon, authenticated, service_role;
GRANT SELECT (content) ON TABLE public.direct_messages TO PUBLIC;
GRANT UPDATE (read) ON TABLE public.direct_messages TO authenticated;

-- The catalog table stands in for an unrelated Realtime publication member.
CREATE PUBLICATION supabase_realtime FOR TABLE public.direct_messages, public.unrelated_public_catalog;
INSERT INTO public.direct_messages (id, sender_id, recipient_id, content, read) VALUES
  ('20000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111', 'PRIVATE_DIRECT_MESSAGE_FIXTURE', false),
  ('20000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222', 'SYNTHETIC_REPLY', true),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111', 'SYNTHETIC_OTHER_CONVERSATION', false),
  ('20000000-0000-4000-8000-000000000004', NULL, NULL, 'SYNTHETIC_LEGACY_MESSAGE', NULL);
