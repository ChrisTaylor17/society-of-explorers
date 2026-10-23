import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeKey(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const key = value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
  return key || fallback;
}

function safePrice(value: unknown): number | null {
  const price = typeof value === 'number' && Number.isFinite(value) ? value : null;
  if (price === null) return null;
  return Math.max(1, Math.min(1_000, Math.round(price * 100) / 100));
}

function parsePublishBody(value: unknown): PublishBody | null {
  if (!isRecord(value)) return null;
  const suggestionId = boundedText(value.suggestionId, 80);
  const name = boundedText(value.name, 160);
  const price = safePrice(value.price);
  if (!suggestionId || !UUID_RE.test(suggestionId) || !name || price === null) return null;

  return {
    suggestionId,
    name,
    tagline: boundedText(value.tagline, 220) || '',
    price,
    thinker_id: safeKey(value.thinker_id, 'socrates'),
    product_type: safeKey(value.product_type, 'poster'),
  };
}

export async function POST(request: NextRequest) {
  const access = await getMovementAccess(request);
  if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body = parsePublishBody(parsed);
  if (!body) {
    return privateJson({ error: 'Valid suggestionId, name, and price are required' }, { status: 400 });
  }

  const { suggestionId, name, tagline, price, thinker_id, product_type } = body;

  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) {
    return privateJson(
      { error: 'PRINTFUL_API_KEY not configured. Add it to Vercel env vars.' },
      { status: 503 },
    );
  }

  const variantId = pickVariantId(product_type ?? '');

  // Fetch the Flux mockup image URL saved by the AI generator (if any).
  const supabaseAdmin = getSupabaseAdmin();
  const { data: suggestion } = await supabaseAdmin
    .from('merch_suggestions')
    .select('image_url')
    .eq('id', suggestionId)
    .single();
  const mockupImageUrl: string | null = suggestion?.image_url ?? null;

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
    return privateJson({ error: 'Could not reach Printful API' }, { status: 502 });
  }

  const printfulData = await printfulRes.json();

  if (!printfulRes.ok) {
    console.error('Printful create failed with status:', printfulRes.status);
    return privateJson({ error: 'Printful publish failed' }, { status: printfulRes.status });
  }

  const printfulProductId: number = printfulData.result?.id;
  if (!printfulProductId) {
    console.error('Printful create failed without product id');
    return privateJson({ error: 'Printful publish failed' }, { status: 500 });
  }

  // Extract sync_variant_id — needed for creating Printful orders on purchase.
  const syncVariantId: number | null = printfulData.result?.sync_variants?.[0]?.id ?? null;

  // Mark suggestion as 'live' in Supabase and store both IDs.
  const { error: dbError } = await supabaseAdmin
    .from('merch_suggestions')
    .update({ status: 'live', printful_product_id: printfulProductId, sync_variant_id: syncVariantId })
    .eq('id', suggestionId);

  if (dbError) {
    // Product was created in Printful but DB update failed — log it, don't block.
    console.error('DB update failed after Printful publish:', dbError.message);
  }

  return privateJson({
    success:             true,
    printful_product_id: printfulProductId,
    printful_url:        `https://www.printful.com/dashboard/sync?store=17946118`,
  });
}
