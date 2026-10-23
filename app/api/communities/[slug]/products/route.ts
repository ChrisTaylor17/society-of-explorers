import { NextRequest } from 'next/server';
import { getAuthenticatedMember } from '@/lib/getAuthenticatedMember';
import { privateJson } from '@/lib/http/routeError';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const PRODUCT_SELECT = 'id, name, description, image_url, price_rep, is_token_gated, created_at';
const MAX_PRODUCT_NAME_LENGTH = 120;
const MAX_PRODUCT_DESCRIPTION_LENGTH = 1000;
const MAX_PRODUCT_IMAGE_URL_LENGTH = 2000;
const MAX_COMMUNITY_SLUG_LENGTH = 120;

type CreateProductBody = {
  name?: string;
  description?: string | null;
  image_url?: string | null;
  price_rep?: number | string | null;
  is_token_gated?: boolean;
};

async function safeRequestJson(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as CreateProductBody;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, maxLength);
}

function normalizeSlug(value: unknown) {
  return boundedText(value, MAX_COMMUNITY_SLUG_LENGTH);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);
  if (!slug) return privateJson({ error: 'DAO not found' }, { status: 404 });

  const supabase = getSupabaseAdmin();

  const { data: community, error } = await supabase
    .from('communities')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !community) {
    return privateJson({ error: 'DAO not found' }, { status: 404 });
  }

  const { data: products, error: productsError } = await supabase
    .from('dao_products')
    .select(PRODUCT_SELECT)
    .eq('community_id', community.id)
    .order('created_at', { ascending: false });

  if (productsError) {
    return privateJson({ error: 'Failed to load products' }, { status: 500 });
  }

  return privateJson({ products: products || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);
  if (!slug) return privateJson({ error: 'DAO not found' }, { status: 404 });

  const body = await safeRequestJson(req);
  if (!body) return privateJson({ error: 'Invalid JSON body' }, { status: 400 });

  const { name, description, image_url, price_rep, is_token_gated } = body;
  const productName = boundedText(name, MAX_PRODUCT_NAME_LENGTH);

  if (!productName) {
    return privateJson({ error: 'Product name required' }, { status: 400 });
  }

  const auth = await getAuthenticatedMember(req);
  if (!auth) {
    return privateJson({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: community, error: cErr } = await supabase
    .from('communities')
    .select('id, owner_member_id')
    .eq('slug', slug)
    .single();

  if (cErr || !community) {
    return privateJson({ error: 'DAO not found' }, { status: 404 });
  }

  if (community.owner_member_id !== auth.memberId) {
    return privateJson({ error: 'Only the DAO owner can create products' }, { status: 403 });
  }

  const { data: product, error: insErr } = await supabase
    .from('dao_products')
    .insert({
      community_id: community.id,
      name: productName,
      description: boundedText(description, MAX_PRODUCT_DESCRIPTION_LENGTH),
      image_url: boundedText(image_url, MAX_PRODUCT_IMAGE_URL_LENGTH),
      price_rep: Math.max(0, Number.parseInt(String(price_rep || 0), 10) || 0),
      is_token_gated: !!is_token_gated,
      created_by: auth.memberId,
    })
    .select(PRODUCT_SELECT)
    .single();

  if (insErr) {
    return privateJson({ error: 'Failed to create product' }, { status: 500 });
  }

  return privateJson({ product });
}
