-- DAO products: per-community storefront items
CREATE TABLE IF NOT EXISTS dao_products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid REFERENCES communities(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  image_url text,
  price_rep integer NOT NULL DEFAULT 0,
  is_token_gated boolean DEFAULT false,
  stock_count integer,
  fulfillment_type text DEFAULT 'manual',
  created_by uuid REFERENCES members(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dao_products_community_id_idx ON dao_products(community_id);

ALTER TABLE dao_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server full access dao_products" ON dao_products;
CREATE POLICY "Server full access dao_products" ON dao_products FOR ALL USING (true) WITH CHECK (true);
