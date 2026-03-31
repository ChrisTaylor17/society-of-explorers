import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Printful catalog variant IDs for each product category.
// Find IDs at: https://developers.printful.com/docs/#tag/Catalog
// Printful Dashboard → Catalog → pick product → note "Variant ID" column.
const VARIANT_MAP: Record<string, number> = {
  'mug':       'mug'        as unknown as number, // placeholder — replace with real Printful variant IDs
  'poster':    'poster'     as unknown as number,
  'notebook':  'notebook'   as unknown as number,
  'journal':   'journal'    as unknown as number,
  'tote':      'tote'       as unknown as number,
  'shirt':     'shirt'      as unknown as number,
  // Real Printful variant IDs examples (uncomment + set correct ones from catalog):
  // 'mug':       18481,  // 11oz White Mug
  // 'poster':    12612,  // Poster 18×24
  // 'notebook':  404,    // Notebook
  // 'tote':      3945,   // Natural tote bag
  // 'shirt':     4011,   // Unisex t-shirt M
};

function pickVariantId(productType: string): number | null {
  const key = productType.toLowerCase().replace(/[^a-z]/g, '');
  // Direct match
  for (const [k, v] of Object.entries(VARIANT_MAP)) {
    if (key.includes(k) && typeof v === 'number') return v;
  }
  return null;
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

  const variantId = pickVariantId(product_type ?? '');
  if (!variantId) {
    return NextResponse.json(
      {
        error: `No Printful variant ID mapped for product type "${product_type}". ` +
               'Set the real variant IDs in VARIANT_MAP in app/api/merch/publish/route.ts.',
      },
      { status: 422 },
    );
  }

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
        ],
      },
    ],
  };

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

  if (!printfulRes.ok) {
    console.error('Printful error:', printfulData);
    return NextResponse.json(
      { error: printfulData?.error?.message ?? printfulData?.result ?? 'Printful error' },
      { status: printfulRes.status },
    );
  }

  const printfulProductId: number = printfulData.result?.id;

  // Mark suggestion as 'live' in Supabase and store the Printful product ID.
  const supabase = createServiceClient();
  const { error: dbError } = await supabase
    .from('merch_suggestions')
    .update({ status: 'live', printful_product_id: printfulProductId })
    .eq('id', suggestionId);

  if (dbError) {
    // Product was created in Printful but DB update failed — log it, don't block.
    console.error('DB update failed after Printful publish:', dbError.message);
  }

  return NextResponse.json({
    success:            true,
    printful_product_id: printfulProductId,
    printful_url:       `https://www.printful.com/dashboard/products`,
  });
}
