import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const FAL_API_KEY = process.env.FAL_API_KEY;

export async function POST(req: NextRequest) {
  const { visual_brief, suggestionId } = await req.json();

  if (!FAL_API_KEY) {
    return NextResponse.json({ error: 'FAL_API_KEY not configured' }, { status: 500 });
  }

  const prompt = `${visual_brief}\n\nphotorealistic product mockup, dark charcoal base, gold accents, matte finish`;

  let imageUrl: string | null = null;

  try {
    const res = await fetch('https://fal.run/fal-ai/flux-pro', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt.slice(0, 2000),
        image_size: 'square_hd',
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
      }),
    });

    const data = await res.json();
    console.log('fal.ai response:', JSON.stringify(data).slice(0, 500));

    if (!res.ok) {
      throw new Error(data?.detail ?? data?.error ?? `fal.ai error ${res.status}`);
    }

    imageUrl = data?.images?.[0]?.url ?? null;
    if (!imageUrl) throw new Error(`No image in fal.ai response: ${JSON.stringify(data).slice(0, 200)}`);

    // Persist to suggestion row if provided
    if (suggestionId) {
      const supabase = createServiceClient();
      await supabase
        .from('merch_suggestions')
        .update({ image_url: imageUrl })
        .eq('id', suggestionId);
    }

    return NextResponse.json({ success: true, image_url: imageUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'fal.ai error';
    console.error('fal.ai error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
