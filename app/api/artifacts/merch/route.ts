import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MERCH_PRODUCTS: Record<string, { id: number; variantId: number; name: string; price: number }> = {
  tshirt: { id: 71, variantId: 4012, name: 'Unisex Staple T-Shirt', price: 29.99 },
  hoodie: { id: 146, variantId: 10094, name: 'Unisex Heavy Blend Hoodie', price: 49.99 },
  mug: { id: 19, variantId: 1320, name: '11oz Mug', price: 19.99 },
  poster: { id: 1, variantId: 1, name: '18×24 Poster', price: 24.99 },
  framed_print: { id: 2, variantId: 10199, name: 'Framed Poster (Black)', price: 59.99 },
};

const ARTIFACT_MERCH_SELECT = 'id, member_id, image_url';
const MAX_ADDRESS_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_ID_LENGTH = 80;

type ArtifactMerchOrderBody = {
  artifactId?: unknown;
  productType?: unknown;
  shippingAddress?: unknown;
  memberEmail?: unknown;
};

type ArtifactMerchRow = {
  id: string;
  member_id: string;
  image_url: string | null;
};

type ShippingAddress = {
  name: string;
  address1: string;
  city: string;
  state: string;
  country: string;
  zip: string;
};

async function safeRequestJson(req: NextRequest): Promise<ArtifactMerchOrderBody | null> {
  try {
    return (await req.json()) as ArtifactMerchOrderBody;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function normalizeEmail(value: unknown): string | null {
  const email = boundedText(value, MAX_EMAIL_LENGTH)?.toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function extractShippingAddress(value: unknown): ShippingAddress | null {
  if (!isRecord(value)) return null;

  const name = boundedText(value.name, MAX_ADDRESS_LENGTH);
  const address1 = boundedText(value.address1, MAX_ADDRESS_LENGTH);
  const city = boundedText(value.city, MAX_ADDRESS_LENGTH);
  const state = boundedText(value.state, 32);
  const zip = boundedText(value.zip, 32);
  const country = boundedText(value.country, 2)?.toUpperCase() || 'US';

  if (!name || !address1 || !city || !state || !zip) return null;
  return { name, address1, city, state, country, zip };
}

function artifactMerchOrderingEnabled() {
  return process.env.ARTIFACT_MERCH_ORDERING_ENABLED === 'true';
}

function printfulOrderId(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.result)) return null;
  const id = payload.result.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

export async function POST(req: NextRequest) {
  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid body' }, { status: 400 });

  const artifactId = boundedText(body.artifactId, MAX_ID_LENGTH);
  const productType = boundedText(body.productType, 32);
  const product = productType ? MERCH_PRODUCTS[productType] : null;
  const shippingAddress = extractShippingAddress(body.shippingAddress);
  const memberEmail = normalizeEmail(body.memberEmail);

  if (!artifactId) return privateJson({ error: 'artifactId required' }, { status: 400 });
  if (!product || !productType) return privateJson({ error: 'Invalid product type' }, { status: 400 });
  if (!shippingAddress) return privateJson({ error: 'Valid shipping address required' }, { status: 400 });
  if (!memberEmail) return privateJson({ error: 'Valid member email required' }, { status: 400 });

  const auth = await getAuthenticatedMember(req);
  if (!auth) return privateJson({ error: 'Unauthorized' }, { status: 401 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: artifact, error: artifactError } = await supabaseAdmin
    .from('artifacts')
    .select(ARTIFACT_MERCH_SELECT)
    .eq('id', artifactId)
    .single<ArtifactMerchRow>();

  if (artifactError || !artifact) return privateJson({ error: 'Artifact not found' }, { status: 404 });
  if (!artifact.image_url) return privateJson({ error: 'Artifact image not found' }, { status: 404 });
  if (artifact.member_id !== auth.memberId) {
    return privateJson({ error: 'Cannot order merch for another member artifact' }, { status: 403 });
  }

  if (!artifactMerchOrderingEnabled()) {
    return privateJson({ error: 'Artifact merch ordering is not enabled' }, { status: 403 });
  }

  const printfulApiKey = process.env.PRINTFUL_API_KEY;
  if (!printfulApiKey) return privateJson({ error: 'Printful is not configured' }, { status: 503 });

  try {
    const printfulResponse = await fetch('https://api.printful.com/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${printfulApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: {
          name: shippingAddress.name,
          address1: shippingAddress.address1,
          city: shippingAddress.city,
          state_code: shippingAddress.state,
          country_code: shippingAddress.country,
          zip: shippingAddress.zip,
          email: memberEmail,
        },
        items: [{ variant_id: product.variantId, quantity: 1, files: [{ type: 'front', url: artifact.image_url }] }],
      }),
    });

    const printfulData: unknown = await printfulResponse.json();
    const orderId = printfulOrderId(printfulData);
    if (!printfulResponse.ok || !orderId) {
      return privateJson({ error: 'Printful order failed' }, { status: 502 });
    }

    const { error: insertError } = await supabaseAdmin.from('artifact_merch').insert({
      artifact_id: artifact.id,
      member_id: auth.memberId,
      printful_order_id: orderId,
      product_type: productType,
      variant_id: product.variantId,
      status: 'ordered',
    });
    if (insertError) return privateJson({ error: 'Failed to record merch order' }, { status: 500 });

    return privateJson({ success: true, orderId, product: product.name, estimatedShipping: '5-8 business days' });
  } catch {
    return privateJson({ error: 'Failed to create merch order' }, { status: 500 });
  }
}
