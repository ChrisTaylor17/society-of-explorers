-- Synthetic Stage 1 fixture. All roles, identifiers and values are test data.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE ROLE unrelated_reader;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, unrelated_reader;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE members (
  id uuid PRIMARY KEY, supabase_auth_id uuid, wallet_address text UNIQUE,
  display_name text NOT NULL, email text, stripe_customer_id text, tier text, private_text text
);
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members readable by all" ON members FOR SELECT USING (true);
CREATE POLICY "Members can insert own record" ON members FOR INSERT WITH CHECK (auth.uid() = supabase_auth_id);
CREATE POLICY "Members can update own record" ON members FOR UPDATE USING (auth.uid() = supabase_auth_id);

CREATE TABLE unrelated_public_catalog (id integer PRIMARY KEY, label text);
GRANT ALL ON unrelated_public_catalog TO anon, authenticated, service_role;
INSERT INTO unrelated_public_catalog VALUES (1, 'PUBLIC_FIXTURE_CATALOG');
CREATE FUNCTION public.fixture_secdef_boundary() RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$SELECT 1$$;
GRANT EXECUTE ON FUNCTION public.fixture_secdef_boundary() TO anon, authenticated;

DO $fixture$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'reading_progress', 'book_highlights', 'great_books_progress',
    'great_books_highlights', 'book_reflections', 'thinker_memory'
  ] LOOP
    EXECUTE format('CREATE TABLE public.%I (id uuid PRIMARY KEY, member_id uuid, private_text text)', relation_name);
    EXECUTE format('INSERT INTO public.%I VALUES ($1, $1, $2)', relation_name)
      USING '11111111-1111-4111-8111-111111111111'::uuid, 'PRIVATE_SYNTHETIC_TEXT'::text;
  END LOOP;
END
$fixture$;

GRANT ALL ON members, reading_progress, book_highlights, great_books_progress,
  great_books_highlights, book_reflections, thinker_memory TO anon, authenticated, service_role;
GRANT SELECT ON members TO unrelated_reader;
INSERT INTO members VALUES (
  '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  NULL, 'FICTIONAL_READER', 'SYNTHETIC_PRIVATE_EMAIL', 'SYNTHETIC_PRIVATE_BILLING', 'free', 'PRIVATE_SYNTHETIC_TEXT'
);
