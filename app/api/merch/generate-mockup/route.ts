import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;

export async function POST(req: NextRequest) {
  const { visual_brief, suggestionId } = await req.json();

  if (!RUNWAY_API_KEY) {
    return NextResponse.json({ error: 'RUNWAY_API_KEY not configured' }, { status: 500 });
  }

  try {
    // 1. Create task
    const createRes = await fetch('https://api.runwayml.com/v1/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNWAY_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-09-13',
      },
      body: JSON.stringify({
        model:      'gen3a_turbo',
        prompt:     visual_brief,
        width:      1024,
        height:     1024,
        num_images: 1,
      }),
    });

    const task = await createRes.json();
    if (!createRes.ok) {
      console.error('Runway create error:', task);
      throw new Error(task?.error ?? task?.message ?? 'Runway task creation failed');
    }

    const taskId = task.id;
    if (!taskId) throw new Error('No task ID returned from Runway');

    // 2. Poll until complete (max ~90s)
    let imageUrl: string | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));

      const pollRes = await fetch(`https://api.runwayml.com/v1/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${RUNWAY_API_KEY}`,
          'X-Runway-Version': '2024-09-13',
        },
      });
      const status = await pollRes.json();

      if (status.status === 'SUCCEEDED') {
        imageUrl = status.output?.[0] ?? status.output?.images?.[0]?.url ?? null;
        break;
      }
      if (status.status === 'FAILED') {
        throw new Error(status.failure ?? status.failureCode ?? status.error ?? 'Runway task failed');
      }
    }

    if (!imageUrl) throw new Error('Timeout waiting for Runway image');

    // 3. Save URL back to the suggestion row
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
