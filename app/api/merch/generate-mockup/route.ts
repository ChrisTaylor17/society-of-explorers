import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
const RUNWAY_BASE    = 'https://api.dev.runwayml.com';

export async function POST(req: NextRequest) {
  const { visual_brief, suggestionId } = await req.json();

  if (!RUNWAY_API_KEY) {
    return NextResponse.json({ error: 'RUNWAY_API_KEY not configured' }, { status: 500 });
  }

  try {
    // 1. Create text-to-image task
    const createRes = await fetch(`${RUNWAY_BASE}/v1/text_to_image`, {
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${RUNWAY_API_KEY}`,
        'Content-Type':    'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({
        promptText: visual_brief.slice(0, 900),
        model:      'gen4_image',
        ratio:      '1:1',
        outputType: 'jpeg',
      }),
    });

    const task = await createRes.json();
    console.log('Runway create response:', JSON.stringify(task));

    if (!createRes.ok) {
      throw new Error(task?.error ?? task?.message ?? `Runway error ${createRes.status}`);
    }

    const taskId = task.id;
    if (!taskId) throw new Error(`No task ID. Runway said: ${JSON.stringify(task)}`);

    // 2. Poll GET /v1/tasks/{id}
    let imageUrl: string | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const pollRes = await fetch(`${RUNWAY_BASE}/v1/tasks/${taskId}`, {
        headers: {
          'Authorization':   `Bearer ${RUNWAY_API_KEY}`,
          'X-Runway-Version': '2024-11-06',
        },
      });
      const status = await pollRes.json();
      console.log(`Runway poll ${i}:`, status.status);

      if (status.status === 'SUCCEEDED') {
        imageUrl = status.output?.[0] ?? null;
        break;
      }
      if (status.status === 'FAILED') {
        throw new Error(status.failure ?? status.failureCode ?? 'Runway task failed');
      }
    }

    if (!imageUrl) throw new Error('Runway timed out');

    // 3. Persist image URL to suggestion row
    if (suggestionId) {
      const supabase = createServiceClient();
      await supabase
        .from('merch_suggestions')
        .update({ image_url: imageUrl })
        .eq('id', suggestionId);
    }

    return NextResponse.json({ success: true, image_url: imageUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Runway error';
    console.error('Runway error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
