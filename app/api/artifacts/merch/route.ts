import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MERCH_PRODUCTS: Record<string, { id: number; variantId: number; name: string; price: number }> = {
  tshirt: { id: 71, variantId: 4012, name: 'Unisex Staple T-Shirt', price: 29.99 },
  hoodie: { id: 146, variantId: 10094, name: 'Unisex Heavy Blend Hoodie', price: 49.99 },
  mug: { id: 19, variantId: 1320, name: '11oz Mug', price: 19.99 },
  poster: { id: 1, variantId: 1, name: '18×24 Poster', price: 24.99 },
  framed_print: { id: 2, variantId: 10199, name: 'Framed Poster (Black)', price: 59.99 },
};

export async function POST(req: NextRequest) {
  try {
    const { artifactId, productType, shippingAddress, memberEmail } = await req.json();
    const { data: artifact } = await supabaseAdmin.from('artifacts').select('*').eq('id', artifactId).single();
    if (!artifact?.image_url) return NextResponse.json({ error: 'Artifact image not found' }, { status: 404 });

    const product = MERCH_PRODUCTS[productType];
    if (!product) return NextResponse.json({ error: 'Invalid product type' }, { status: 400 });

    const printfulResponse = await fetch('https://api.printful.com/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: {
          name: shippingAddress.name, address1: shippingAddress.address1,
          city: shippingAddress.city, state_code: shippingAddress.state,
          country_code: shippingAddress.country || 'US', zip: shippingAddress.zip, email: memberEmail,
        },
        items: [{ variant_id: product.variantId, quantity: 1, files: [{ type: 'front', url: artifact.image_url }] }],
      }),
    });

    const printfulData = await printfulResponse.json();
    if (!printfulResponse.ok) throw new Error(printfulData.error?.message || 'Printful order failed');

    await supabaseAdmin.from('artifact_merch').insert({
      artifact_id: artifactId, member_id: artifact.member_id,
      printful_order_id: String(printfulData.result?.id), product_type: productType,
      variant_id: product.variantId, status: 'ordered',
    });

    return NextResponse.json({ success: true, orderId: printfulData.result?.id, product: product.name, estimatedShipping: '5-8 business days' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
