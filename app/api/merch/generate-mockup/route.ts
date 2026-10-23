import { NextRequest } from 'next/server';
import { privateJson } from '@/lib/http/routeError';
import { getMovementAccess } from '@/lib/movement/access';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const access = await getMovementAccess(req);
  if (!access) return privateJson({ error: 'Unauthorized' }, { status: 401 });
  if (!access.canManage) return privateJson({ error: 'Oracle or founder access required' }, { status: 403 });

  const { visual_brief: visualBrief, suggestionId } = (await req.json().catch(() => ({}))) as {
    visual_brief?: unknown;
    suggestionId?: unknown;
  };
  if (typeof visualBrief !== 'string' || !visualBrief.trim()) {
    return privateJson({ error: 'visual_brief required' }, { status: 400 });
  }

  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) {
    return privateJson({ error: 'FAL_API_KEY not configured' }, { status: 503 });
  }

  const prompt = `${visualBrief.trim().slice(0, 1_500)}\n\nphotorealistic product mockup, dark charcoal base, gold accents, matte finish`;

  let imageUrl: string | null = null;

  try {
    const res = await fetch('https://fal.run/fal-ai/flux-pro', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falApiKey}`,
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
    if (typeof suggestionId === 'string' && suggestionId) {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin
        .from('merch_suggestions')
        .update({ image_url: imageUrl })
        .eq('id', suggestionId);
    }

    return privateJson({ success: true, image_url: imageUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'fal.ai error';
    console.error('fal.ai error:', msg);
    return privateJson({ error: 'Mockup generation failed' }, { status: 500 });
  }
}
