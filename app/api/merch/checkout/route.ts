import { NextRequest, NextResponse } from 'next/server';

// Printful create-order endpoint (v1 API).
// Docs: https://developers.printful.com/docs/#operation/createOrder
//
// Required env var: PRINTFUL_API_KEY  (Printful → Dashboard → Stores → API Access)
// Orders are created as drafts (confirm: false) so no shipment fires until you
// review and confirm them in the Printful dashboard or via PATCH /orders/{id}/confirm.

export interface CheckoutBody {
  variantId: number;        // Printful variant ID (from your store's sync products)
  quantity:  number;        // default 1
  recipient: {
    name:         string;
    email:        string;
    address1:     string;
    city:         string;
    state_code:   string;   // e.g. "TX"
    country_code: string;   // e.g. "US"
    zip:          string;
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.PRINTFUL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'PRINTFUL_API_KEY is not configured. Add it to .env.local and Vercel env vars.' },
      { status: 503 },
    );
  }

  let body: CheckoutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { variantId, quantity = 1, recipient } = body;

  if (!variantId || variantId <= 0) {
    return NextResponse.json(
      { error: 'variantId is required. Set the Printful variant ID in MerchOverlay PRODUCTS.' },
      { status: 400 },
    );
  }
  if (!recipient?.name || !recipient?.address1 || !recipient?.city || !recipient?.zip) {
    return NextResponse.json({ error: 'Incomplete shipping address' }, { status: 400 });
  }

  const printfulBody = {
    // confirm: false → draft order. Won't ship until confirmed in Printful dashboard.
    confirm: false,
    recipient,
    items: [{ variant_id: variantId, quantity }],
  };

  let res: Response;
  try {
    res = await fetch('https://api.printful.com/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(printfulBody),
    });
  } catch (err) {
    console.error('Printful network error:', err);
    return NextResponse.json({ error: 'Could not reach Printful API' }, { status: 502 });
  }

  const data = await res.json();

  if (!res.ok) {
    console.error('Printful error response:', data);
    return NextResponse.json(
      { error: data?.error?.message ?? data?.result ?? 'Printful error' },
      { status: res.status },
    );
  }

  const order = data.result;
  return NextResponse.json({
    orderId:    order.id,
    status:     order.status,          // "draft"
    costs:      order.costs,           // { subtotal, shipping, tax, total, currency }
    shipTo:     order.recipient?.name,
  });
}
