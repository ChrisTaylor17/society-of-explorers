-- DAO orders: purchase records for dao_products
CREATE TABLE IF NOT EXISTS dao_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid REFERENCES communities(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES dao_products(id) ON DELETE CASCADE NOT NULL,
  buyer_id uuid REFERENCES members(id) NOT NULL,
  price_paid integer NOT NULL,
  token_symbol text NOT NULL DEFAULT 'REP',
  status text NOT NULL DEFAULT 'pending',
  wallet_address text,
  fulfillment_status text DEFAULT 'unfulfilled',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dao_orders_buyer_idx ON dao_orders(buyer_id);
CREATE INDEX IF NOT EXISTS dao_orders_community_idx ON dao_orders(community_id);

ALTER TABLE dao_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server full access dao_orders" ON dao_orders;
CREATE POLICY "Server full access dao_orders" ON dao_orders FOR ALL USING (true) WITH CHECK (true);
