-- Hosted table and policy shape with synthetic records and representative grants.
CREATE ROLE postgres;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE ROLE fixture_audit;
GRANT CREATE ON SCHEMA public TO postgres;
CREATE SCHEMA auth AUTHORIZATION postgres;
SET ROLE postgres;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE TABLE public.twiddles (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES auth.users(id),
  content text,
  twiddle_type text CHECK (twiddle_type IN ('text','voice','artifact','question','sketch')),
  thread_type text CHECK (thread_type IN ('solo','open','collaborative')),
  voice_url text, artifact_url text, sketch_data jsonb, thinker_tags text[],
  mintable boolean, minted boolean, nft_token_id integer, exp_awarded integer,
  parent_id uuid REFERENCES public.twiddles(id), root_id uuid REFERENCES public.twiddles(id),
  is_thinker_response boolean, thinker_key text, is_woven boolean, woven_from uuid[],
  created_at timestamptz, updated_at timestamptz
);
CREATE TABLE public.twiddle_collaborators (
  id uuid PRIMARY KEY, twiddle_id uuid REFERENCES public.twiddles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id), created_at timestamptz,
  contribution_type text CHECK (contribution_type IN ('branch','remix','weave','voice')),
  UNIQUE (twiddle_id, user_id)
);
CREATE TABLE public.twiddle_reactions (
  id uuid PRIMARY KEY, twiddle_id uuid REFERENCES public.twiddles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id), created_at timestamptz,
  reaction_type text CHECK (reaction_type IN ('illuminate','challenge','extend','question','mint_worthy')),
  UNIQUE (twiddle_id, user_id, reaction_type)
);
CREATE FUNCTION public.update_twiddle_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER twiddles_updated BEFORE UPDATE ON public.twiddles
  FOR EACH ROW EXECUTE FUNCTION public.update_twiddle_timestamp();

ALTER TABLE public.twiddles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twiddle_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twiddle_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authors can update own twiddles" ON public.twiddles FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Members can create twiddles" ON public.twiddles FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Twiddles are viewable by members" ON public.twiddles FOR SELECT USING (true);
CREATE POLICY twiddles_select ON public.twiddles FOR SELECT USING (true);
CREATE POLICY twiddles_insert ON public.twiddles FOR INSERT WITH CHECK (true);
CREATE POLICY twiddles_update ON public.twiddles FOR UPDATE USING (true);
CREATE POLICY collab_all ON public.twiddle_collaborators USING (true) WITH CHECK (true);
CREATE POLICY reactions_all ON public.twiddle_reactions USING (true) WITH CHECK (true);

GRANT ALL ON public.twiddles, public.twiddle_collaborators, public.twiddle_reactions TO anon, authenticated, service_role;
GRANT SELECT (content), UPDATE (content) ON public.twiddles TO PUBLIC;
GRANT SELECT (user_id), UPDATE (user_id) ON public.twiddle_collaborators TO anon;
GRANT SELECT (user_id), INSERT (reaction_type) ON public.twiddle_reactions TO authenticated;
GRANT SELECT (id) ON public.twiddles TO fixture_audit;

INSERT INTO auth.users VALUES ('a1111111-1111-4111-8111-111111111111');
INSERT INTO public.twiddles (id, author_id, content, twiddle_type, thread_type) VALUES
  ('a1111111-1111-4111-8111-111111111112', 'a1111111-1111-4111-8111-111111111111', 'Synthetic original', 'text', 'open');
INSERT INTO public.twiddle_collaborators (id, twiddle_id, user_id, contribution_type) VALUES
  ('a1111111-1111-4111-8111-111111111113', 'a1111111-1111-4111-8111-111111111112', 'a1111111-1111-4111-8111-111111111111', 'branch');
INSERT INTO public.twiddle_reactions (id, twiddle_id, user_id, reaction_type) VALUES
  ('a1111111-1111-4111-8111-111111111114', 'a1111111-1111-4111-8111-111111111112', 'a1111111-1111-4111-8111-111111111111', 'question');
