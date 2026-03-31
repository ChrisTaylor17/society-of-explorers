import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Printful catalog variant IDs.
// Verify these in: Printful Dashboard → Catalog → pick product → Variant ID column.
// Or browse the API: GET https://api.printful.com/products (lists catalog products)
//                   GET https://api.printful.com/products/{product_id} (lists variants)
const VARIANT_MAP: Record<string, number> = {
  mug:      1320,   // White Glossy Mug 11oz (catalog product 19)
  poster:   1349,   // Enhanced Matte Paper Poster 12″×16″ (catalog product 1)
  print:    1349,   // Art print — same base
  notebook: 1349,   // No standalone notebook in catalog; use poster as fallback
  journal:  1349,
  tote:     9039,   // All-Over Print Large Tote Bag w/ Pocket Black (catalog product 274)
  shirt:    4022,   // Bella + Canvas 3001 Unisex Tee M (catalog product 71)
};

const DEFAULT_VARIANT = 1349; // poster — safe fallback

function pickVariantId(productType: string): number {
  const key = productType.toLowerCase().replace(/[^a-z]/g, '');
  for (const [k, v] of Object.entries(VARIANT_MAP)) {
    if (key.includes(k)) return v;
  }
  return DEFAULT_VARIANT;
}

export interface PublishBody {
  suggestionId: string;
  name:         string;
  tagline:      string;
  price:        number;    // retail price in USD (e.g. 24.99)
  thinker_id:   string;
  product_type: string;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'PRINTFUL_API_KEY not configured. Add it to Vercel env vars.' },
      { status: 503 },
    );
  }

  let body: PublishBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { suggestionId, name, tagline, price, thinker_id, product_type } = body;

  if (!suggestionId || !name) {
    return NextResponse.json({ error: 'suggestionId and name are required' }, { status: 400 });
  }

  console.log('Publish called with suggestionId:', suggestionId, '| name:', name, '| type:', product_type);

  const variantId = pickVariantId(product_type ?? '');

  // Fetch the Flux mockup image URL saved by the AI generator (if any).
  const supabase = createServiceClient();
  const { data: suggestion } = await supabase
    .from('merch_suggestions')
    .select('image_url')
    .eq('id', suggestionId)
    .single();
  const mockupImageUrl: string | null = suggestion?.image_url ?? null;
  console.log('Fetched image_url:', mockupImageUrl ?? '(none)');

  // Use the existing SVG metadata API as the print artwork URL.
  // Printful fetches this URL at product creation time — it must be publicly accessible.
  const baseUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.societyofexplorers.com';
  const thinkerIndex = ['socrates','plato','nietzsche','aurelius','einstein','jobs'].indexOf(thinker_id);
  const artworkTokenId = thinkerIndex >= 0 ? thinkerIndex : 0;
  const artworkUrl = `${baseUrl}/api/nft/${artworkTokenId}?format=svg`;

  // POST /store/products — creates a sync product in your Printful store.
  // Docs: https://developers.printful.com/docs/#operation/createStoreProduct
  const printfulBody = {
    sync_product: {
      name,
      description: tagline,
      // Flux mockup shown as the product thumbnail in Printful dashboard/store.
      ...(mockupImageUrl ? { thumbnail_url: mockupImageUrl } : {}),
    },
    sync_variants: [
      {
        variant_id:   variantId,
        retail_price: price.toFixed(2),   // dollars, NOT cents
        files: [
          {
            type: 'default',
            url:  artworkUrl,
          },
          // Include the Flux image as a preview mockup file if available.
          ...(mockupImageUrl ? [{ type: 'preview', url: mockupImageUrl }] : []),
        ],
      },
    ],
  };

  console.log('Printful payload:', JSON.stringify(printfulBody));

  let printfulRes: Response;
  try {
    printfulRes = await fetch('https://api.printful.com/store/products', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(printfulBody),
    });
  } catch (err) {
    console.error('Printful network error:', err);
    return NextResponse.json({ error: 'Could not reach Printful API' }, { status: 502 });
  }

  const printfulData = await printfulRes.json();
  console.log('Printful response:', JSON.stringify(printfulData).slice(0, 500));

  if (!printfulRes.ok) {
    console.error('Printful create failed:', printfulData);
    return NextResponse.json(
      { error: printfulData?.error?.message ?? printfulData?.result ?? 'Printful error' },
      { status: printfulRes.status },
    );
  }

  const printfulProductId: number = printfulData.result?.id;
  if (!printfulProductId) {
    console.error('Printful create failed — no product ID:', printfulData);
    return NextResponse.json(
      { error: `Printful error: no product ID returned. Response: ${JSON.stringify(printfulData).slice(0, 200)}` },
      { status: 500 },
    );
  }

  console.log('Printful product created:', printfulProductId);

  // Mark suggestion as 'live' in Supabase and store the Printful product ID.
  const { error: dbError } = await supabase
    .from('merch_suggestions')
    .update({ status: 'live', printful_product_id: printfulProductId })
    .eq('id', suggestionId);

  if (dbError) {
    // Product was created in Printful but DB update failed — log it, don't block.
    console.error('DB update failed after Printful publish:', dbError.message);
  }

  return NextResponse.json({
    success:             true,
    printful_product_id: printfulProductId,
    printful_url:        `https://www.printful.com/dashboard/products/${printfulProductId}`,
  });
}
